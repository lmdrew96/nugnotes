/**
 * Concepts and threads within a course. After a session's pages are read (or a
 * source's PDF), Claude lists its concepts against the course's known ones
 * (convex/conceptExtract.ts); each concept is backed by the lines that mention
 * it. A thread is one concept's mentions across sessions, in class-date order.
 * No manual linking: the student dismisses wrong concepts or splits bad merges.
 */
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
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
import { type KnownConcept, type RefLine, classLines, nameKey, sourceLines } from './conceptText';
import { loadSourcePages } from './sources';

/** Wait before reading, so pages still finishing in the same batch join one read. */
const READ_DELAY_MS = 20_000;

const mentionsOfSession = (ctx: QueryCtx, sessionId: Id<'sessions'>) =>
  ctx.db
    .query('conceptMentions')
    .withIndex('by_session', (q) => q.eq('sessionId', sessionId))
    .collect();

const conceptsOfCourse = (ctx: QueryCtx, courseId: Id<'courses'>) =>
  ctx.db
    .query('concepts')
    .withIndex('by_course', (q) => q.eq('courseId', courseId))
    .collect();

/** Delete concepts left with no mentions (dismissed ones stay, so they stay dismissed). */
const dropOrphans = async (ctx: MutationCtx, conceptIds: Iterable<Id<'concepts'>>) => {
  for (const id of new Set(conceptIds)) {
    const concept = await ctx.db.get(id);
    if (!concept || concept.dismissed) continue;
    const any = await ctx.db
      .query('conceptMentions')
      .withIndex('by_concept', (q) => q.eq('conceptId', id))
      .first();
    if (!any) await ctx.db.delete(id);
  }
};

/** Remove a session's mentions (permanent delete, course change, before a re-read). */
export const deleteSessionConcepts = async (
  ctx: MutationCtx,
  sessionId: Id<'sessions'>,
): Promise<void> => {
  const mentions = await mentionsOfSession(ctx, sessionId);
  for (const m of mentions) await ctx.db.delete(m._id);
  await dropOrphans(
    ctx,
    mentions.map((m) => m.conceptId),
  );
};

/** Queue a concept read of a session. A later queue supersedes an earlier one. */
export const queueConcepts = async (ctx: MutationCtx, sessionId: Id<'sessions'>) => {
  const session = await ctx.db.get(sessionId);
  if (!session?.courseId || session.isDeleted) return;
  const queuedAt = Date.now();
  await ctx.db.patch(sessionId, { conceptsStatus: 'pending', conceptsQueuedAt: queuedAt });
  await ctx.scheduler.runAfter(READ_DELAY_MS, internal.conceptExtract.read, {
    sessionId,
    queuedAt,
  });
};

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

/** A session's lines, labelled for Claude to cite (class pages or source PDF pages). */
export const loadSessionLines = async (
  ctx: QueryCtx,
  session: Doc<'sessions'>,
): Promise<RefLine[]> => {
  if (session.kind === 'source') return sourceLines(await loadSourcePages(ctx, session._id));
  const pages = await ctx.db
    .query('pages')
    .withIndex('by_session_order', (q) => q.eq('sessionId', session._id))
    .collect();
  return classLines(pages);
};

const requireOwnCourse = async (ctx: QueryCtx, courseId: Id<'courses'>) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const course = await ctx.db.get(courseId);
  return course && course.userId === identity.subject ? course : null;
};

const requireOwnConcept = async (ctx: MutationCtx, conceptId: Id<'concepts'>) => {
  const userId = await requireAuth(ctx);
  const concept = await ctx.db.get(conceptId);
  if (!concept || concept.userId !== userId) throw new Error('Concept not found');
  return concept;
};

// ── Reads for the UI ──

/** A course's concepts with how many sessions each runs through, plus read status. */
export const listForCourse = query({
  args: { courseId: v.id('courses') },
  handler: async (ctx, { courseId }) => {
    const course = await requireOwnCourse(ctx, courseId);
    if (!course) return null;
    const sessions = (
      await ctx.db
        .query('sessions')
        .withIndex('by_course', (q) => q.eq('courseId', courseId))
        .collect()
    ).filter((s) => !s.isDeleted);
    const live = new Set(sessions.map((s) => s._id));
    const mentions = await ctx.db
      .query('conceptMentions')
      .withIndex('by_course', (q) => q.eq('courseId', courseId))
      .collect();
    const sessionsOf = new Map<Id<'concepts'>, Set<Id<'sessions'>>>();
    for (const m of mentions) {
      if (!live.has(m.sessionId)) continue;
      const set = sessionsOf.get(m.conceptId) ?? new Set();
      set.add(m.sessionId);
      sessionsOf.set(m.conceptId, set);
    }
    const concepts = (await conceptsOfCourse(ctx, courseId))
      .map((c) => ({
        _id: c._id,
        name: c.name,
        kind: c.kind,
        aliases: c.aliases,
        dismissed: c.dismissed,
        sessionCount: sessionsOf.get(c._id)?.size ?? 0,
      }))
      .filter((c) => c.dismissed || c.sessionCount > 0)
      .sort((a, b) => b.sessionCount - a.sessionCount || a.name.localeCompare(b.name));
    return {
      courseName: course.name,
      concepts,
      sessionCount: sessions.length,
      reading: sessions.filter((s) => s.conceptsStatus === 'pending').length,
      unread: sessions.filter(
        (s) => s.conceptsStatus === undefined || s.conceptsStatus === 'failed',
      ).length,
    };
  },
});

/** One concept's thread: its mentions grouped by session, oldest class first. */
export const thread = query({
  args: { conceptId: v.id('concepts') },
  handler: async (ctx, { conceptId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const concept = await ctx.db.get(conceptId);
    if (!concept || concept.userId !== identity.subject) return null;
    const mentions = await ctx.db
      .query('conceptMentions')
      .withIndex('by_concept', (q) => q.eq('conceptId', conceptId))
      .collect();

    const sessions = new Map<Id<'sessions'>, Doc<'sessions'> | null>();
    const pages = new Map<Id<'pages'>, Doc<'pages'> | null>();
    const groups = new Map<
      Id<'sessions'>,
      {
        sessionId: Id<'sessions'>;
        title: string;
        classDate?: string;
        createdAt: number;
        isSource: boolean;
        entries: {
          mentionId: Id<'conceptMentions'>;
          text: string;
          pageIndex?: number;
          sourcePage?: number;
        }[];
      }
    >();
    for (const m of mentions) {
      if (!sessions.has(m.sessionId)) sessions.set(m.sessionId, await ctx.db.get(m.sessionId));
      const session = sessions.get(m.sessionId);
      if (!session || session.isDeleted) continue;
      let text = m.quote;
      let pageIndex: number | undefined;
      if (m.pageId) {
        if (!pages.has(m.pageId)) pages.set(m.pageId, await ctx.db.get(m.pageId));
        const page = pages.get(m.pageId);
        if (!page) continue; // page removed since it was read
        // The live line, so a hand fix shows here too.
        text = page.transcript?.[m.line]?.text ?? m.quote;
        pageIndex = page.order;
      }
      const group = groups.get(m.sessionId) ?? {
        sessionId: m.sessionId,
        title: session.title,
        classDate: session.classDate,
        createdAt: session.createdAt,
        isSource: session.kind === 'source',
        entries: [],
      };
      group.entries.push({ mentionId: m._id, text, pageIndex, sourcePage: m.sourcePage });
      groups.set(m.sessionId, group);
    }
    const timeline = [...groups.values()].sort(
      (a, b) => (a.classDate ?? '').localeCompare(b.classDate ?? '') || a.createdAt - b.createdAt,
    );
    for (const group of timeline) {
      group.entries.sort(
        (a, b) => (a.pageIndex ?? a.sourcePage ?? 0) - (b.pageIndex ?? b.sourcePage ?? 0),
      );
    }
    return {
      _id: concept._id,
      courseId: concept.courseId,
      name: concept.name,
      kind: concept.kind,
      aliases: concept.aliases,
      dismissed: concept.dismissed,
      timeline,
    };
  },
});

// ── Student actions ──

/** Hide a wrong concept (kept so it isn't found again), or bring it back. */
export const setDismissed = mutation({
  args: { conceptId: v.id('concepts'), dismissed: v.boolean() },
  handler: async (ctx, { conceptId, dismissed }): Promise<void> => {
    await requireOwnConcept(ctx, conceptId);
    await ctx.db.patch(conceptId, { dismissed, updatedAt: Date.now() });
  },
});

/** Split a bad merge: move some mentions to a concept of their own. */
export const split = mutation({
  args: {
    conceptId: v.id('concepts'),
    mentionIds: v.array(v.id('conceptMentions')),
    name: v.string(),
  },
  handler: async (ctx, { conceptId, mentionIds, name }): Promise<Id<'concepts'>> => {
    const concept = await requireOwnConcept(ctx, conceptId);
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed) {
      throw new ConvexError({ code: 'EMPTY_NAME', message: 'Give the new concept a name.' });
    }
    if (mentionIds.length === 0) {
      throw new ConvexError({ code: 'NOTHING_PICKED', message: 'Pick the lines to split off.' });
    }
    const now = Date.now();
    const newId = await ctx.db.insert('concepts', {
      userId: concept.userId,
      courseId: concept.courseId,
      name: trimmed,
      aliases: [],
      kind: concept.kind,
      dismissed: false,
      createdAt: now,
      updatedAt: now,
    });
    for (const id of mentionIds) {
      const mention = await ctx.db.get(id);
      if (mention?.conceptId === conceptId) await ctx.db.patch(id, { conceptId: newId });
    }
    // Its old name is no longer an alias of the original.
    const key = nameKey(trimmed);
    await ctx.db.patch(conceptId, {
      aliases: concept.aliases.filter((a) => nameKey(a) !== key),
      updatedAt: now,
    });
    await dropOrphans(ctx, [conceptId]);
    return newId;
  },
});

/**
 * Read a course's sessions for concepts, whiskers and contradictions: the ones
 * never read (or failed), or with `all`, every session again.
 */
export const readCourse = mutation({
  args: { courseId: v.id('courses'), all: v.optional(v.boolean()) },
  handler: async (ctx, { courseId, all }): Promise<number> => {
    const userId = await requireAuth(ctx);
    const course = await ctx.db.get(courseId);
    if (!course || course.userId !== userId) throw new Error('Course not found');
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_course', (q) => q.eq('courseId', courseId))
      .collect();
    const unread = sessions.filter(
      (s) =>
        !s.isDeleted &&
        s.conceptsStatus !== 'pending' &&
        (all || s.conceptsStatus === undefined || s.conceptsStatus === 'failed'),
    );
    for (const s of unread) await queueConcepts(ctx, s._id);
    return unread.length;
  },
});

// ── Used by the read action ──

export const getReadInput = internalQuery({
  args: { sessionId: v.id('sessions'), queuedAt: v.number() },
  handler: async (ctx, { sessionId, queuedAt }) => {
    const session = await ctx.db.get(sessionId);
    if (!session?.courseId || session.isDeleted || session.conceptsQueuedAt !== queuedAt) {
      return null; // deleted, moved out of a course, or superseded by a newer read
    }
    const isSource = session.kind === 'source';
    const lines = await loadSessionLines(ctx, session);
    const known: (KnownConcept & { id: Id<'concepts'> })[] = (
      await conceptsOfCourse(ctx, session.courseId)
    ).map((c, i) => ({
      key: `C${i + 1}`,
      id: c._id,
      name: c.name,
      kind: c.kind,
      aliases: c.aliases,
    }));
    return { title: session.title, isSource, lines, known };
  },
});

const mentionArg = v.object({
  pageId: v.optional(v.id('pages')),
  sourcePage: v.optional(v.number()),
  line: v.number(),
  quote: v.string(),
});

export const saveRead = internalMutation({
  args: {
    sessionId: v.id('sessions'),
    queuedAt: v.number(),
    concepts: v.array(
      v.object({
        existingId: v.optional(v.id('concepts')),
        name: v.string(),
        kind: v.string(),
        aliases: v.array(v.string()),
        mentions: v.array(mentionArg),
      }),
    ),
  },
  handler: async (ctx, { sessionId, queuedAt, concepts }): Promise<void> => {
    const session = await ctx.db.get(sessionId);
    const courseId = session?.courseId;
    if (!session || !courseId || session.conceptsQueuedAt !== queuedAt) return;

    // A re-read replaces this session's mentions.
    const old = await mentionsOfSession(ctx, sessionId);
    for (const m of old) await ctx.db.delete(m._id);

    const course = await conceptsOfCourse(ctx, courseId);
    const byKey = new Map<string, Doc<'concepts'>>();
    for (const c of course) {
      for (const n of [c.name, ...c.aliases]) byKey.set(nameKey(n), c);
    }
    const now = Date.now();
    for (const item of concepts) {
      const existing =
        (item.existingId && course.find((c) => c._id === item.existingId)) ||
        byKey.get(nameKey(item.name));
      let conceptId: Id<'concepts'>;
      if (existing) {
        conceptId = existing._id;
        const have = new Set([existing.name, ...existing.aliases].map(nameKey));
        const add = [item.name, ...item.aliases].filter((a) => !have.has(nameKey(a)));
        if (add.length > 0) {
          const aliases = [...existing.aliases, ...new Set(add)].slice(0, 20);
          await ctx.db.patch(conceptId, { aliases, updatedAt: now });
          existing.aliases = aliases;
        }
      } else {
        conceptId = await ctx.db.insert('concepts', {
          userId: session.userId,
          courseId,
          name: item.name,
          aliases: [...new Set(item.aliases)].filter((a) => nameKey(a) !== nameKey(item.name)),
          kind: item.kind,
          dismissed: false,
          createdAt: now,
          updatedAt: now,
        });
        const created = await ctx.db.get(conceptId);
        if (created)
          for (const n of [created.name, ...created.aliases]) byKey.set(nameKey(n), created);
      }
      for (const m of item.mentions) {
        await ctx.db.insert('conceptMentions', {
          userId: session.userId,
          courseId,
          conceptId,
          sessionId,
          ...m,
          createdAt: now,
        });
      }
    }
    await dropOrphans(
      ctx,
      old.map((m) => m.conceptId),
    );
    // Next in the same read: whiskers and contradictions (convex/gaps.ts), which
    // marks the read done.
    await ctx.scheduler.runAfter(0, internal.gapExtract.read, { sessionId, queuedAt });
  },
});

export const markReadFailed = internalMutation({
  args: { sessionId: v.id('sessions'), queuedAt: v.number() },
  handler: async (ctx, { sessionId, queuedAt }): Promise<void> => {
    const session = await ctx.db.get(sessionId);
    if (session?.conceptsQueuedAt === queuedAt) {
      await ctx.db.patch(sessionId, { conceptsStatus: 'failed' });
    }
  },
});
