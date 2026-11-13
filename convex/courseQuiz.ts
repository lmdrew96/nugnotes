/**
 * Nugget's course quiz: from a thread (one concept), a theme, a range of sessions
 * ("Weeks 6–10") or the whole course. Multiple choice questions come from the
 * student's own lines, each pointing back to its page. Open whiskers become
 * "do you know it?" check-ins, built here without Claude: the notes don't hold
 * their answers, so they can't be graded as multiple choice.
 */
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { action, internalQuery } from './_generated/server';
import type { RefLine } from './conceptText';
import { loadSessionLines } from './concepts';
import { AI_MODEL_SONNET, callClaude } from './config';
import { formatDateKey } from './dateKey';
import { PHOTOS_NOTE, pagesNote, photoBlocks } from './pagePhotos';
import { buildQuizPrompt, parseQuiz } from './quizText';
import { enforceLimit, requireUserId } from './rateLimits';
import { NOT_ENOUGH_MATERIAL } from './studyMaterial';

/** Where a line is from, for "from your notes" under each answer. */
export interface QuizSource {
  sessionId: Id<'sessions'>;
  title: string;
  date: string;
  isSource: boolean;
  text: string;
  page?: number;
  label?: string;
}

type QuizLine = RefLine & { source: QuizSource };

interface QuizInput {
  courseName: string;
  scopeLabel: string;
  focus?: { name: string; aliases: string[]; ideas?: string[] };
  lines: QuizLine[];
  whiskers: Doc<'whiskers'>[];
  /** The sessions in scope and, for a thread or theme, its concepts: they pick the page photos. */
  sessionIds: Id<'sessions'>[];
  conceptIds?: Id<'concepts'>[];
}

export interface CourseQuiz {
  scopeLabel: string;
  /** "Nugget read the 12 most relevant of 40 pages", when the photos were capped. */
  pagesNote?: string;
  questions: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    sources: QuizSource[];
  }[];
  checkIns: { whiskerId: Id<'whiskers'>; kind: string; label: string; sources: QuizSource[] }[];
}

const scopeArg = v.union(
  v.object({ kind: v.literal('course') }),
  v.object({ kind: v.literal('thread'), conceptId: v.id('concepts') }),
  v.object({ kind: v.literal('theme'), themeId: v.id('themes') }),
  v.object({ kind: v.literal('range'), from: v.string(), to: v.string() }),
);

export const getQuizInput = internalQuery({
  args: { userId: v.string(), courseId: v.id('courses'), scope: scopeArg },
  handler: async (ctx, { userId, courseId, scope }): Promise<QuizInput | null> => {
    const course = await ctx.db.get(courseId);
    if (!course || course.userId !== userId) return null;
    let sessions: Doc<'sessions'>[] = (
      await ctx.db
        .query('sessions')
        .withIndex('by_course', (q) => q.eq('courseId', courseId))
        .collect()
    ).filter((s) => !s.isDeleted);

    let focus: QuizInput['focus'];
    let conceptIds: Id<'concepts'>[] | undefined;
    let scopeLabel = 'the whole course';
    if (scope.kind === 'thread') {
      const concept = await ctx.db.get(scope.conceptId);
      if (!concept || concept.courseId !== courseId) return null;
      focus = { name: concept.name, aliases: concept.aliases };
      conceptIds = [concept._id];
      scopeLabel = `the thread on ${concept.name}`;
      const ids = new Set(
        (
          await ctx.db
            .query('conceptMentions')
            .withIndex('by_concept', (q) => q.eq('conceptId', scope.conceptId))
            .collect()
        ).map((m) => m.sessionId),
      );
      sessions = sessions.filter((s) => ids.has(s._id));
    } else if (scope.kind === 'theme') {
      const theme = await ctx.db.get(scope.themeId);
      if (!theme || theme.courseId !== courseId) return null;
      const subs = (
        await ctx.db
          .query('themes')
          .withIndex('by_course', (q) => q.eq('courseId', courseId))
          .collect()
      ).filter((t) => t.parentId === theme._id);
      const themeIds = new Set([theme._id, ...subs.map((t) => t._id)]);
      const concepts = (
        await ctx.db
          .query('concepts')
          .withIndex('by_course', (q) => q.eq('courseId', courseId))
          .collect()
      ).filter((c) => !c.dismissed && c.themeId && themeIds.has(c.themeId));
      focus = { name: theme.name, aliases: [], ideas: concepts.map((c) => c.name) };
      conceptIds = concepts.map((c) => c._id);
      scopeLabel = `the theme ${theme.name}`;
      const ids = new Set<Id<'sessions'>>();
      for (const c of concepts) {
        for (const m of await ctx.db
          .query('conceptMentions')
          .withIndex('by_concept', (q) => q.eq('conceptId', c._id))
          .collect()) {
          ids.add(m.sessionId);
        }
      }
      sessions = sessions.filter((s) => ids.has(s._id));
    } else if (scope.kind === 'range') {
      sessions = sessions.filter(
        (s) => s.classDate && s.classDate >= scope.from && s.classDate <= scope.to,
      );
      scopeLabel = `sessions from ${formatDateKey(scope.from)} to ${formatDateKey(scope.to)}`;
    }
    sessions.sort((a, b) => (a.classDate ?? '').localeCompare(b.classDate ?? ''));

    // Each session's lines, with where they're from. Session index keeps the
    // labels unique across sessions (P/S labels repeat per session otherwise).
    const lines: QuizLine[] = [];
    for (const [i, session] of sessions.entries()) {
      const pageOrder = new Map<string, number>();
      if (session.kind !== 'source') {
        for (const p of await ctx.db
          .query('pages')
          .withIndex('by_session_order', (q) => q.eq('sessionId', session._id))
          .collect()) {
          pageOrder.set(p._id, p.order);
        }
      }
      for (const l of await loadSessionLines(ctx, session)) {
        const order = l.pageId ? pageOrder.get(l.pageId) : undefined;
        lines.push({
          ...l,
          ref: `${i + 1}${l.ref}`,
          source: {
            sessionId: session._id,
            title: session.title,
            date: session.classDate ? formatDateKey(session.classDate) : '',
            isSource: session.kind === 'source',
            text: l.text,
            page: order ?? l.sourcePage,
            label:
              order !== undefined
                ? `Page ${order + 1}`
                : l.sourcePage !== undefined
                  ? `p. ${l.sourcePage}`
                  : undefined,
          },
        });
      }
    }

    // Open whiskers raised in the sessions in scope.
    const inScope = new Set(sessions.map((s) => s._id));
    const whiskers = (
      await ctx.db
        .query('whiskers')
        .withIndex('by_course', (q) => q.eq('courseId', courseId))
        .collect()
    ).filter((w) => w.status === 'open' && inScope.has(w.sessionId));

    return {
      courseName: course.name,
      scopeLabel,
      focus,
      lines,
      whiskers,
      sessionIds: sessions.map((s) => s._id),
      conceptIds,
    };
  },
});

export const generate = action({
  args: {
    courseId: v.id('courses'),
    scope: scopeArg,
    count: v.number(),
    includeWhiskers: v.boolean(),
  },
  handler: async (ctx, { courseId, scope, count, includeWhiskers }): Promise<CourseQuiz> => {
    const userId = await requireUserId(ctx);
    await enforceLimit(ctx, 'aiGenerate', userId);
    const input: QuizInput | null = await ctx.runQuery(internal.courseQuiz.getQuizInput, {
      userId,
      courseId,
      scope,
    });
    if (!input) throw new ConvexError({ code: 'NOT_FOUND', message: 'Course not found.' });
    const textChars = input.lines.reduce((n, l) => n + l.text.length, 0);
    if (textChars < 80) throw new ConvexError(NOT_ENOUGH_MATERIAL);

    const n = Math.min(Math.max(Math.round(count), 3), 20);
    const picked = await ctx.runQuery(internal.pagePhotos.pick, {
      sessionIds: input.sessionIds,
      conceptIds: input.conceptIds,
    });
    const photos = await photoBlocks(picked.photos);
    const prompt = buildQuizPrompt({
      courseName: input.courseName,
      scope: input.scopeLabel,
      focus: input.focus,
      lines: input.lines,
      count: n,
    });
    const reply = await callClaude({
      // Sonnet: a wrong "right answer" teaches the wrong thing (Haiku wrote one
      // in testing, Nov 5).
      model: AI_MODEL_SONNET,
      maxTokens: 16000,
      messages: [
        {
          role: 'user',
          content: photos.length
            ? [
                ...photos,
                {
                  type: 'text',
                  text: `${PHOTOS_NOTE} Still cite answers by the line labels in the notes below.\n\n${prompt}`,
                },
              ]
            : prompt,
        },
      ],
    });
    const byRef = new Map(input.lines.map((l) => [l.ref, l.source]));
    const questions = parseQuiz(reply, new Set(byRef.keys())).map((q) => ({
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      sources: q.refs.flatMap((r) => byRef.get(r) ?? []),
    }));
    if (questions.length === 0) {
      throw new ConvexError({
        code: 'QUIZ_FAILED',
        message:
          'Nugget couldn’t write questions from these notes. Try again or pick more sessions.',
      });
    }

    const checkIns = includeWhiskers
      ? input.whiskers.slice(0, 5).map((w) => ({
          whiskerId: w._id,
          kind: w.kind,
          label: w.label,
          sources: w.lines.flatMap(
            (l) =>
              input.lines.find(
                (x) =>
                  x.source.sessionId === l.sessionId &&
                  x.line === l.line &&
                  (x.pageId ?? null) === (l.pageId ?? null) &&
                  (x.sourcePage ?? null) === (l.sourcePage ?? null),
              )?.source ?? [],
          ),
        }))
      : [];

    return { scopeLabel: input.scopeLabel, pagesNote: pagesNote(picked), questions, checkIns };
  },
});
