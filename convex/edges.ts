/**
 * Edges: concept ↔ concept connections a course's notes actually make ("H.M.
 * is a case of amnesia"), found in the same read as the concepts
 * (convex/conceptText.ts links) and backed by the lines that show them. A new
 * session adds its evidence to the pair's edge; a re-read replaces only that
 * session's. Dismissed edges stay dismissed, matched by the two names.
 */
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, mutation, query } from './_generated/server';
import { requireAuth } from './authHelpers';
import { matchKeys } from './conceptText';
import { formatDateKey } from './dateKey';

export type EdgeEvidence = Doc<'conceptEdges'>['evidence'][number];

/** The same for either order of the two names, and for other wordings of them. */
export const pairKeyOf = (a: string, b: string): string =>
  [matchKeys(a)[0] ?? a, matchKeys(b)[0] ?? b].sort().join('|');

const edgesOfCourse = (ctx: MutationCtx, courseId: Id<'courses'>) =>
  ctx.db
    .query('conceptEdges')
    .withIndex('by_course', (q) => q.eq('courseId', courseId))
    .collect();

/** Take a session's evidence off its course's edges (before a re-read, or when it's deleted). */
export const removeSessionEvidence = async (
  ctx: MutationCtx,
  courseId: Id<'courses'>,
  sessionId: Id<'sessions'>,
): Promise<void> => {
  for (const edge of await edgesOfCourse(ctx, courseId)) {
    const evidence = edge.evidence.filter((e) => e.sessionId !== sessionId);
    if (evidence.length === edge.evidence.length) continue;
    if (evidence.length === 0 && !edge.dismissed) await ctx.db.delete(edge._id);
    else await ctx.db.patch(edge._id, { evidence, updatedAt: Date.now() });
  }
};

/** Add a session's links to its course's edges. */
export const saveSessionEdges = async (
  ctx: MutationCtx,
  opts: {
    userId: string;
    courseId: Id<'courses'>;
    links: {
      a: { id: Id<'concepts'>; name: string };
      b: { id: Id<'concepts'>; name: string };
      how: string;
      evidence: EdgeEvidence[];
    }[];
  },
): Promise<void> => {
  const now = Date.now();
  for (const link of opts.links) {
    if (link.a.id === link.b.id) continue; // two wordings merged into one concept
    const pairKey = pairKeyOf(link.a.name, link.b.name);
    const edge = await ctx.db
      .query('conceptEdges')
      .withIndex('by_course_pair', (q) => q.eq('courseId', opts.courseId).eq('pairKey', pairKey))
      .first();
    if (edge) {
      const sessions = new Set(link.evidence.map((e) => e.sessionId));
      await ctx.db.patch(edge._id, {
        aId: link.a.id,
        bId: link.b.id,
        how: link.how,
        evidence: [...edge.evidence.filter((e) => !sessions.has(e.sessionId)), ...link.evidence],
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('conceptEdges', {
        userId: opts.userId,
        courseId: opts.courseId,
        aId: link.a.id,
        bId: link.b.id,
        pairKey,
        how: link.how,
        evidence: link.evidence,
        dismissed: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
};

/**
 * Delete the edges of concepts that are gone, or with no concepts given, every
 * edge in the course. Dismissed edges stay, so they stay dismissed.
 */
export const dropEdges = async (
  ctx: MutationCtx,
  courseId: Id<'courses'>,
  conceptIds?: Set<Id<'concepts'>>,
): Promise<void> => {
  for (const edge of await edgesOfCourse(ctx, courseId)) {
    if (edge.dismissed) continue;
    if (!conceptIds || conceptIds.has(edge.aId) || conceptIds.has(edge.bId)) {
      await ctx.db.delete(edge._id);
    }
  }
};

/**
 * What a thread connects to: the other concept, how, and the pages that show
 * it, oldest first. Class pages are linked, never quoted (the transcript is a
 * hidden index); a source's PDF text is quoted.
 */
export const forConcept = query({
  args: { conceptId: v.id('concepts') },
  handler: async (ctx, { conceptId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const concept = await ctx.db.get(conceptId);
    if (!concept || concept.userId !== identity.subject) return null;
    const edges = (
      await ctx.db
        .query('conceptEdges')
        .withIndex('by_course', (q) => q.eq('courseId', concept.courseId))
        .collect()
    ).filter((e) => e.aId === conceptId || e.bId === conceptId);
    const out = [];
    for (const edge of edges) {
      const other = await ctx.db.get(edge.aId === conceptId ? edge.bId : edge.aId);
      if (!other || other.dismissed) continue;
      const cites = [];
      for (const e of edge.evidence) {
        const session = await ctx.db.get(e.sessionId);
        if (!session || session.isDeleted) continue;
        const page = e.pageId ? await ctx.db.get(e.pageId) : null;
        if (e.pageId && !page) continue; // page removed since
        cites.push({
          sessionId: e.sessionId,
          classDate: session.classDate,
          date: session.classDate ? formatDateKey(session.classDate) : session.title,
          page: page ? page.order : e.sourcePage,
          label: page ? `Page ${page.order + 1}` : `p. ${e.sourcePage ?? 1}`,
          quote: session.kind === 'source' ? e.quote : undefined,
        });
      }
      if (cites.length === 0) continue;
      cites.sort((x, y) => (x.classDate ?? '').localeCompare(y.classDate ?? ''));
      out.push({
        _id: edge._id,
        other: { _id: other._id, name: other.name, themeId: other.themeId },
        how: edge.how,
        dismissed: edge.dismissed,
        cites,
      });
    }
    return out.sort(
      (x, y) => Number(x.dismissed) - Number(y.dismissed) || y.cites.length - x.cites.length,
    );
  },
});

/** Hide a wrong connection (kept, so a re-read doesn't bring it back), or bring it back. */
export const setDismissed = mutation({
  args: { edgeId: v.id('conceptEdges'), dismissed: v.boolean() },
  handler: async (ctx, { edgeId, dismissed }): Promise<void> => {
    const userId = await requireAuth(ctx);
    const edge = await ctx.db.get(edgeId);
    if (!edge || edge.userId !== userId) throw new Error('Connection not found');
    await ctx.db.patch(edgeId, { dismissed, updatedAt: Date.now() });
  },
});
