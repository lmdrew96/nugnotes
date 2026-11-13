/**
 * The concept-read queue. A course's sessions are read for concepts one at a
 * time, oldest class first, so each read knows (and merges into) the concepts
 * found before it. A course's conceptsLock names the read that is running.
 */
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, internalMutation } from './_generated/server';
import { afterSessionRead } from './themes';

/** Wait before reading, so pages still finishing in the same batch join one read. */
const READ_DELAY_MS = 20_000;
/** A concept read that hasn't reported back by now has died (actions stop at 10 min). */
const LOCK_STALE_MS = 12 * 60_000;

/** Class-date order, then creation order: the order a course's sessions are read in. */
const byClassOrder = (a: Doc<'sessions'>, b: Doc<'sessions'>) =>
  (a.classDate ?? '').localeCompare(b.classDate ?? '') || a.createdAt - b.createdAt;

/** Queue a concept read of a session. A later queue supersedes an earlier one. */
export const queueConcepts = async (ctx: MutationCtx, sessionId: Id<'sessions'>) => {
  const session = await ctx.db.get(sessionId);
  if (!session?.courseId || session.isDeleted) return;
  const queuedAt = Date.now();
  await ctx.db.patch(sessionId, { conceptsStatus: 'pending', conceptsQueuedAt: queuedAt });
  await ctx.scheduler.runAfter(READ_DELAY_MS, internal.conceptQueue.pump, {
    courseId: session.courseId,
  });
};

/**
 * Start a course's next concept read unless one is running: one at a time,
 * oldest class first. Run concurrently, each read only knew the concepts from
 * before the batch, so nothing merged across the sessions read together.
 */
export const pump = internalMutation({
  args: { courseId: v.id('courses') },
  handler: async (ctx, { courseId }): Promise<void> => {
    const course = await ctx.db.get(courseId);
    if (!course) return;
    const now = Date.now();
    const lock = course.conceptsLock;
    if (lock) {
      if (now - lock.startedAt < LOCK_STALE_MS) return;
      // The read never reported back (e.g. its action timed out).
      const stuck = await ctx.db.get(lock.sessionId);
      if (stuck?.conceptsStatus === 'pending' && stuck.conceptsQueuedAt === lock.queuedAt) {
        await ctx.db.patch(stuck._id, { conceptsStatus: 'failed' });
      }
      await ctx.db.patch(courseId, { conceptsLock: undefined });
    }
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_course', (q) => q.eq('courseId', courseId))
      .collect();
    // Waiting, and past the batching delay (a newer queue brings its own pump).
    const next = sessions
      .filter(
        (s) =>
          !s.isDeleted &&
          s.conceptsStatus === 'pending' &&
          s.conceptsQueuedAt !== undefined &&
          s.conceptsQueuedAt !== s.conceptsDispatchedAt &&
          now - s.conceptsQueuedAt >= READ_DELAY_MS - 1000,
      )
      .sort(byClassOrder)[0];
    const queuedAt = next?.conceptsQueuedAt;
    if (!next || queuedAt === undefined) return;
    await ctx.db.patch(next._id, { conceptsDispatchedAt: queuedAt });
    await ctx.db.patch(courseId, {
      conceptsLock: { sessionId: next._id, queuedAt, startedAt: now },
    });
    await ctx.scheduler.runAfter(0, internal.conceptExtract.read, {
      sessionId: next._id,
      queuedAt,
    });
    // Watchdog, in case the read dies without reporting back.
    await ctx.scheduler.runAfter(LOCK_STALE_MS + 1000, internal.conceptQueue.pump, { courseId });
  },
});

/** A session's concept read is over (saved, failed or superseded): let the next one start. */
export const releaseRead = async (
  ctx: MutationCtx,
  courseId: Id<'courses'>,
  sessionId: Id<'sessions'>,
  queuedAt: number,
) => {
  const course = await ctx.db.get(courseId);
  const lock = course?.conceptsLock;
  if (lock?.sessionId === sessionId && lock.queuedAt === queuedAt) {
    await ctx.db.patch(courseId, { conceptsLock: undefined });
  }
  await ctx.scheduler.runAfter(0, internal.conceptQueue.pump, { courseId });
};

/** The read action found nothing to read (superseded, deleted, moved out of the course). */
export const skipRead = internalMutation({
  args: { sessionId: v.id('sessions'), queuedAt: v.number() },
  handler: async (ctx, { sessionId, queuedAt }): Promise<void> => {
    const session = await ctx.db.get(sessionId);
    if (session?.courseId) await releaseRead(ctx, session.courseId, sessionId, queuedAt);
  },
});

/** Queue a read once none of a class session's pages are still being read. */
export const queueConceptsWhenPagesRead = async (
  ctx: MutationCtx,
  sessionId: Id<'sessions'>,
): Promise<void> => {
  const pending = await ctx.db
    .query('pages')
    .withIndex('by_session_order', (q) => q.eq('sessionId', sessionId))
    .filter((q) => q.eq(q.field('transcriptStatus'), 'pending'))
    .first();
  if (!pending) await queueConcepts(ctx, sessionId);
};

/** A session's read failed (its concept or its whisker step). */
export const markReadFailed = internalMutation({
  args: { sessionId: v.id('sessions'), queuedAt: v.number() },
  handler: async (ctx, { sessionId, queuedAt }): Promise<void> => {
    const session = await ctx.db.get(sessionId);
    if (session?.conceptsQueuedAt === queuedAt) {
      await ctx.db.patch(sessionId, { conceptsStatus: 'failed' });
      if (session.courseId) await afterSessionRead(ctx, session.courseId);
    }
    if (session?.courseId) await releaseRead(ctx, session.courseId, sessionId, queuedAt);
  },
});
