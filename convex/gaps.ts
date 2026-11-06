/**
 * Whiskers and contradictions in a course: the second half of a session's read
 * (after concepts, convex/concepts.ts). Whiskers are what the notes point at but
 * never fill in; contradictions are two lines from different sessions that
 * disagree. Both point back to the student's own lines and never edit a page.
 */
import { type Infer, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import {
  type MutationCtx,
  type QueryCtx,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { requireAuth } from './authHelpers';
import { nameKey } from './conceptText';
import { loadSessionLines } from './concepts';
import { formatDateKey } from './dateKey';
import type { KnownWhisker, OtherLine } from './gapText';
import { lineRef } from './schema';

type LineRef = Infer<typeof lineRef>;

/** Lines from other sessions sent per read, for spotting disagreements. */
const MAX_OTHER_LINES = 60;
const OTHER_LINES_PER_CONCEPT = 3;

const whiskersOfCourse = (ctx: QueryCtx, courseId: Id<'courses'>) =>
  ctx.db
    .query('whiskers')
    .withIndex('by_course', (q) => q.eq('courseId', courseId))
    .collect();

const locationKey = (l: LineRef): string =>
  `${l.sessionId}:${l.pageId ?? `s${l.sourcePage}`}:${l.line}`;

/** A line as shown: live text (so hand fixes show), its session, and where to open it. */
export interface ShownLine {
  sessionId: Id<'sessions'>;
  title: string;
  date: string;
  isSource: boolean;
  text: string;
  /** Class page index (0-based) or source PDF page (1-based), for ?page=. */
  page?: number;
  label?: string;
}

const makeResolver = (ctx: QueryCtx) => {
  const sessions = new Map<Id<'sessions'>, Doc<'sessions'> | null>();
  const pages = new Map<Id<'pages'>, Doc<'pages'> | null>();
  return async (ref: LineRef): Promise<ShownLine | null> => {
    if (!sessions.has(ref.sessionId)) sessions.set(ref.sessionId, await ctx.db.get(ref.sessionId));
    const session = sessions.get(ref.sessionId);
    if (!session || session.isDeleted) return null;
    const base = {
      sessionId: ref.sessionId,
      title: session.title,
      date: session.classDate ? formatDateKey(session.classDate) : '',
      isSource: session.kind === 'source',
    };
    if (ref.pageId) {
      if (!pages.has(ref.pageId)) pages.set(ref.pageId, await ctx.db.get(ref.pageId));
      const page = pages.get(ref.pageId);
      if (!page) return null;
      return {
        ...base,
        text: page.transcript?.[ref.line]?.text ?? ref.quote,
        page: page.order,
        label: `Page ${page.order + 1}`,
      };
    }
    return {
      ...base,
      text: ref.quote,
      page: ref.sourcePage,
      label: ref.sourcePage !== undefined ? `p. ${ref.sourcePage}` : undefined,
    };
  };
};

const resolveAll = async (
  resolve: ReturnType<typeof makeResolver>,
  refs: LineRef[],
): Promise<ShownLine[]> => (await Promise.all(refs.map(resolve))).filter((l) => l !== null);

const ownCourse = async (ctx: QueryCtx, courseId: Id<'courses'>) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const course = await ctx.db.get(courseId);
  return course && course.userId === identity.subject ? course : null;
};

// ── Reads for the UI ──

export const listWhiskers = query({
  args: { courseId: v.id('courses') },
  handler: async (ctx, { courseId }) => {
    if (!(await ownCourse(ctx, courseId))) return null;
    const resolve = makeResolver(ctx);
    const out = [];
    for (const w of await whiskersOfCourse(ctx, courseId)) {
      const lines = await resolveAll(resolve, w.lines);
      if (lines.length === 0) continue; // its session or pages are gone
      out.push({
        _id: w._id,
        kind: w.kind,
        label: w.label,
        status: w.status,
        lines,
        answerLines: await resolveAll(resolve, w.answerLines ?? []),
        answerNote: w.answerNote,
        createdAt: w.createdAt,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listContradictions = query({
  args: { courseId: v.id('courses') },
  handler: async (ctx, { courseId }) => {
    if (!(await ownCourse(ctx, courseId))) return null;
    const resolve = makeResolver(ctx);
    const rows = await ctx.db
      .query('contradictions')
      .withIndex('by_course', (q) => q.eq('courseId', courseId))
      .collect();
    const out = [];
    for (const c of rows) {
      const [a, b] = await Promise.all([resolve(c.a), resolve(c.b)]);
      if (!a || !b) continue;
      // Older session on the left.
      const [left, right, leftKey, rightKey] =
        c.b.sessionId !== c.a.sessionId && (b.date || '') < (a.date || '') && b.date
          ? [b, a, 'b' as const, 'a' as const]
          : [a, b, 'a' as const, 'b' as const];
      out.push({
        _id: c._id,
        about: c.about,
        status: c.status,
        left: { ...left, key: leftKey },
        right: { ...right, key: rightKey },
        createdAt: c.createdAt,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ── Student actions ──

const ownWhisker = async (ctx: MutationCtx, id: Id<'whiskers'>) => {
  const userId = await requireAuth(ctx);
  const whisker = await ctx.db.get(id);
  if (!whisker || whisker.userId !== userId) throw new Error('Whisker not found');
  return whisker;
};

/** Answer a whisker with the student's own note (e.g. "asked in office hours: …"). */
export const answerWhisker = mutation({
  args: { whiskerId: v.id('whiskers'), note: v.string() },
  handler: async (ctx, { whiskerId, note }): Promise<void> => {
    await ownWhisker(ctx, whiskerId);
    const text = note.trim().slice(0, 2000);
    if (!text) throw new Error('Empty answer');
    await ctx.db.patch(whiskerId, {
      status: 'answered',
      answerNote: text,
      updatedAt: Date.now(),
    });
  },
});

/** Dismiss a whisker, or reopen one (clearing any answer). */
export const setWhiskerStatus = mutation({
  args: {
    whiskerId: v.id('whiskers'),
    status: v.union(v.literal('open'), v.literal('dismissed')),
  },
  handler: async (ctx, { whiskerId, status }): Promise<void> => {
    await ownWhisker(ctx, whiskerId);
    await ctx.db.patch(whiskerId, {
      status,
      ...(status === 'open' && { answerLines: undefined, answerNote: undefined }),
      updatedAt: Date.now(),
    });
  },
});

/** Pick the line that's right, mark it for the professor, dismiss, or reopen. */
export const resolveContradiction = mutation({
  args: {
    contradictionId: v.id('contradictions'),
    status: v.union(
      v.literal('open'),
      v.literal('a'),
      v.literal('b'),
      v.literal('ask'),
      v.literal('dismissed'),
    ),
  },
  handler: async (ctx, { contradictionId, status }): Promise<void> => {
    const userId = await requireAuth(ctx);
    const row = await ctx.db.get(contradictionId);
    if (!row || row.userId !== userId) throw new Error('Contradiction not found');
    await ctx.db.patch(contradictionId, { status, updatedAt: Date.now() });
  },
});

/** Permanent session delete: drop what it raised, reopen what it answered. */
export const deleteSessionGaps = async (
  ctx: MutationCtx,
  session: Doc<'sessions'>,
): Promise<void> => {
  for (const w of await ctx.db
    .query('whiskers')
    .withIndex('by_session', (q) => q.eq('sessionId', session._id))
    .collect()) {
    await ctx.db.delete(w._id);
  }
  if (session.courseId) {
    for (const w of await whiskersOfCourse(ctx, session.courseId)) {
      if (w.answerLines?.some((l) => l.sessionId === session._id)) {
        await ctx.db.patch(w._id, { status: 'open', answerLines: undefined });
      }
    }
  }
  for (const index of ['by_a_session', 'by_b_session'] as const) {
    const field = index === 'by_a_session' ? 'aSessionId' : 'bSessionId';
    for (const c of await ctx.db
      .query('contradictions')
      .withIndex(index, (q) => q.eq(field, session._id))
      .collect()) {
      await ctx.db.delete(c._id);
    }
  }
};

// ── Used by the read action ──

export const getGapInput = internalQuery({
  args: { sessionId: v.id('sessions'), queuedAt: v.number() },
  handler: async (ctx, { sessionId, queuedAt }) => {
    const session = await ctx.db.get(sessionId);
    const courseId = session?.courseId;
    if (!session || !courseId || session.isDeleted || session.conceptsQueuedAt !== queuedAt) {
      return null;
    }
    const lines = await loadSessionLines(ctx, session);

    // Whiskers raised by other sessions (this session's own open ones are
    // replaced by this read); settled ones so they aren't raised again.
    const known: (KnownWhisker & { id: Id<'whiskers'> })[] = (await whiskersOfCourse(ctx, courseId))
      .filter((w) => w.sessionId !== sessionId || w.status !== 'open')
      .slice(-150)
      .map((w, i) => ({
        key: `W${i + 1}`,
        id: w._id,
        kind: w.kind,
        label: w.label,
        status: w.status,
      }));

    // Lines from other sessions about the concepts this session mentions.
    const resolve = makeResolver(ctx);
    const mine = await ctx.db
      .query('conceptMentions')
      .withIndex('by_session', (q) => q.eq('sessionId', sessionId))
      .collect();
    const others: (OtherLine & { refData: LineRef })[] = [];
    for (const conceptId of new Set(mine.map((m) => m.conceptId))) {
      if (others.length >= MAX_OTHER_LINES) break;
      const theirs = (
        await ctx.db
          .query('conceptMentions')
          .withIndex('by_concept', (q) => q.eq('conceptId', conceptId))
          .collect()
      ).filter((m) => m.sessionId !== sessionId);
      for (const m of theirs.slice(0, OTHER_LINES_PER_CONCEPT)) {
        const refData: LineRef = {
          sessionId: m.sessionId,
          pageId: m.pageId,
          sourcePage: m.sourcePage,
          line: m.line,
          quote: m.quote,
        };
        const shown = await resolve(refData);
        if (!shown) continue;
        others.push({
          ref: `E${others.length + 1}`,
          text: shown.text,
          line: m.line,
          pageId: m.pageId,
          sourcePage: m.sourcePage,
          sessionId: m.sessionId,
          where: [shown.date, shown.title].filter(Boolean).join(', '),
          refData: { ...refData, quote: shown.text },
        });
        if (others.length >= MAX_OTHER_LINES) break;
      }
    }
    return { title: session.title, isSource: session.kind === 'source', lines, known, others };
  },
});

export const saveGaps = internalMutation({
  args: {
    sessionId: v.id('sessions'),
    queuedAt: v.number(),
    whiskers: v.array(v.object({ kind: v.string(), label: v.string(), lines: v.array(lineRef) })),
    answered: v.array(v.object({ whiskerId: v.id('whiskers'), lines: v.array(lineRef) })),
    contradictions: v.array(v.object({ about: v.string(), a: lineRef, b: lineRef })),
  },
  handler: async (ctx, args): Promise<void> => {
    const session = await ctx.db.get(args.sessionId);
    const courseId = session?.courseId;
    if (!session || !courseId || session.conceptsQueuedAt !== args.queuedAt) return;
    const now = Date.now();
    const base = { userId: session.userId, courseId, createdAt: now, updatedAt: now };

    // A re-read replaces this session's open whiskers and contradictions;
    // anything the student settled stays.
    const course = await whiskersOfCourse(ctx, courseId);
    for (const w of course) {
      if (w.sessionId === args.sessionId && w.status === 'open') await ctx.db.delete(w._id);
    }
    const kept = new Set(
      course
        .filter((w) => w.sessionId !== args.sessionId || w.status !== 'open')
        .map((w) => nameKey(w.label)),
    );
    for (const w of args.whiskers) {
      if (kept.has(nameKey(w.label))) continue;
      kept.add(nameKey(w.label));
      await ctx.db.insert('whiskers', { ...base, sessionId: args.sessionId, ...w, status: 'open' });
    }

    for (const a of args.answered) {
      const whisker = await ctx.db.get(a.whiskerId);
      if (whisker?.courseId !== courseId || whisker.status !== 'open') continue;
      await ctx.db.patch(a.whiskerId, { status: 'answered', answerLines: a.lines, updatedAt: now });
    }

    const existing = await ctx.db
      .query('contradictions')
      .withIndex('by_course', (q) => q.eq('courseId', courseId))
      .collect();
    for (const c of existing) {
      if (c.aSessionId === args.sessionId && c.status === 'open') await ctx.db.delete(c._id);
    }
    const pairs = new Set(
      existing
        .filter((c) => !(c.aSessionId === args.sessionId && c.status === 'open'))
        .flatMap((c) => [
          `${locationKey(c.a)}|${locationKey(c.b)}`,
          `${locationKey(c.b)}|${locationKey(c.a)}`,
        ]),
    );
    for (const c of args.contradictions) {
      const key = `${locationKey(c.a)}|${locationKey(c.b)}`;
      if (pairs.has(key)) continue;
      pairs.add(key);
      await ctx.db.insert('contradictions', {
        ...base,
        ...c,
        aSessionId: c.a.sessionId,
        bSessionId: c.b.sessionId,
        status: 'open',
      });
    }

    await ctx.db.patch(args.sessionId, { conceptsStatus: 'done' });
  },
});
