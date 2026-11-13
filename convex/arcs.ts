/**
 * Arcs: one cited line per thread on how its idea moved across the course
 * (convex/arcText.ts), written by Claude once a course has no sessions left
 * reading. Only threads whose sessions changed since their arc are rewritten.
 */
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { type MutationCtx, internalMutation, internalQuery } from './_generated/server';
import { formatDateKey } from './dateKey';

const ARC_DELAY_MS = 5_000;
/** Threads rewritten per run; the rest follow in the next run. */
const MAX_THREADS_PER_RUN = 40;
const LINES_PER_SESSION = 4;

/** Queue an arc refresh for a course. A later queue supersedes an earlier one. */
export const queueArcs = async (ctx: MutationCtx, courseId: Id<'courses'>): Promise<void> => {
  const queuedAt = Date.now();
  await ctx.db.patch(courseId, { arcsQueuedAt: queuedAt });
  await ctx.scheduler.runAfter(ARC_DELAY_MS, internal.arcWrite.write, { courseId, queuedAt });
};

const citeArg = v.object({
  sessionId: v.id('sessions'),
  pageId: v.optional(v.id('pages')),
  sourcePage: v.optional(v.number()),
});

export const getArcInput = internalQuery({
  args: { courseId: v.id('courses'), queuedAt: v.number() },
  handler: async (ctx, { courseId, queuedAt }) => {
    const course = await ctx.db.get(courseId);
    if (!course || course.arcsQueuedAt !== queuedAt) return null; // superseded
    const sessions = new Map(
      (
        await ctx.db
          .query('sessions')
          .withIndex('by_course', (q) => q.eq('courseId', courseId))
          .collect()
      )
        .filter((s) => !s.isDeleted)
        .map((s) => [s._id, s]),
    );
    const mentions = (
      await ctx.db
        .query('conceptMentions')
        .withIndex('by_course', (q) => q.eq('courseId', courseId))
        .collect()
    ).filter((m) => sessions.has(m.sessionId));
    const concepts = await ctx.db
      .query('concepts')
      .withIndex('by_course', (q) => q.eq('courseId', courseId))
      .collect();

    const clear: Id<'concepts'>[] = [];
    const stale = [];
    for (const c of concepts) {
      const mine = mentions.filter((m) => m.conceptId === c._id);
      const sessionIds = [...new Set(mine.map((m) => m.sessionId))];
      if (c.dismissed || sessionIds.length < 2) {
        if (c.arc) clear.push(c._id);
        continue;
      }
      const signature = [...sessionIds].sort().join(',');
      if (c.arc?.signature !== signature) stale.push({ concept: c, mine, signature });
    }

    const pageCache = new Map<Id<'pages'>, string[]>();
    const threads = [];
    for (const [i, { concept, mine, signature }] of stale.slice(0, MAX_THREADS_PER_RUN).entries()) {
      const bySession = [...new Set(mine.map((m) => m.sessionId))]
        .flatMap((id) => sessions.get(id) ?? [])
        .sort(
          (a, b) =>
            (a.classDate ?? '').localeCompare(b.classDate ?? '') || a.createdAt - b.createdAt,
        );
      const list = [];
      for (const [j, session] of bySession.entries()) {
        const here = mine.filter((m) => m.sessionId === session._id).slice(0, LINES_PER_SESSION);
        const lines: string[] = [];
        for (const m of here) {
          let text = m.quote;
          if (m.pageId) {
            if (!pageCache.has(m.pageId)) {
              const page = await ctx.db.get(m.pageId);
              pageCache.set(m.pageId, page?.transcript?.map((l) => l.text) ?? []);
            }
            text = pageCache.get(m.pageId)?.[m.line] ?? m.quote;
          }
          lines.push(text);
        }
        list.push({
          key: `S${j + 1}`,
          date: session.classDate ? formatDateKey(session.classDate) : session.title,
          isSource: session.kind === 'source',
          lines,
          cite: {
            sessionId: session._id,
            pageId: here[0]?.pageId,
            sourcePage: here[0]?.sourcePage,
          },
        });
      }
      threads.push({
        key: `A${i + 1}`,
        conceptId: concept._id,
        name: concept.name,
        signature,
        sessions: list,
      });
    }
    return {
      courseName: course.name,
      threads,
      clear,
      more: stale.length > MAX_THREADS_PER_RUN,
    };
  },
});

export const saveArcs = internalMutation({
  args: {
    courseId: v.id('courses'),
    queuedAt: v.number(),
    arcs: v.array(
      v.object({
        conceptId: v.id('concepts'),
        text: v.string(),
        signature: v.string(),
        cites: v.array(citeArg),
      }),
    ),
    clear: v.array(v.id('concepts')),
    more: v.boolean(),
  },
  handler: async (ctx, { courseId, queuedAt, arcs, clear, more }): Promise<void> => {
    const course = await ctx.db.get(courseId);
    if (!course || course.arcsQueuedAt !== queuedAt) return; // superseded
    for (const id of clear) await ctx.db.patch(id, { arc: undefined });
    for (const a of arcs) {
      const concept = await ctx.db.get(a.conceptId);
      if (!concept) continue;
      await ctx.db.patch(a.conceptId, {
        arc: { text: a.text, cites: a.cites, signature: a.signature },
      });
    }
    if (more) await queueArcs(ctx, courseId);
  },
});
