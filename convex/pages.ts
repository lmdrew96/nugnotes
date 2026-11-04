import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, type QueryCtx, mutation, query } from './_generated/server';
import { requireAuth } from './authHelpers';
import { r2 } from './r2';

/** Signed photo links last a week; a page left open that long just needs a reload. */
const PHOTO_URL_SECONDS = 7 * 24 * 60 * 60;

export interface PageWithUrl {
  _id: Id<'pages'>;
  order: number;
  url: string;
}

const pagesOf = (ctx: QueryCtx, sessionId: Id<'sessions'>): Promise<Doc<'pages'>[]> =>
  ctx.db
    .query('pages')
    .withIndex('by_session_order', (q) => q.eq('sessionId', sessionId))
    .collect();

const requireOwnSession = async (
  ctx: MutationCtx,
  sessionId: Id<'sessions'>,
): Promise<{ userId: string; session: Doc<'sessions'> }> => {
  const userId = await requireAuth(ctx);
  const session = await ctx.db.get(sessionId);
  if (!session || session.userId !== userId || session.isDeleted) {
    throw new Error('Session not found');
  }
  return { userId, session };
};

const requireOwnPage = async (
  ctx: MutationCtx,
  pageId: Id<'pages'>,
): Promise<{ userId: string; page: Doc<'pages'> }> => {
  const userId = await requireAuth(ctx);
  const page = await ctx.db.get(pageId);
  if (!page || page.userId !== userId) throw new Error('Page not found');
  return { userId, page };
};

/** Keep orders 0..n-1 after a page leaves. */
const renumber = async (ctx: MutationCtx, sessionId: Id<'sessions'>): Promise<void> => {
  const pages = await pagesOf(ctx, sessionId);
  for (const [index, page] of pages.entries()) {
    if (page.order !== index) await ctx.db.patch(page._id, { order: index });
  }
};

/** A session's pages in reading order, each with a signed photo link. Owner only. */
export const list = query({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }): Promise<PageWithUrl[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== identity.subject) return [];
    const pages = await pagesOf(ctx, sessionId);
    return await Promise.all(
      pages.map(async (page) => ({
        _id: page._id,
        order: page.order,
        url: await r2.getUrl(page.storageKey, { expiresIn: PHOTO_URL_SECONDS }),
      })),
    );
  },
});

/** Append an uploaded photo as the session's next page. */
export const add = mutation({
  args: { sessionId: v.id('sessions'), storageKey: v.string() },
  handler: async (ctx, { sessionId, storageKey }): Promise<Id<'pages'>> => {
    const { userId } = await requireOwnSession(ctx, sessionId);
    const existing = await pagesOf(ctx, sessionId);
    const now = Date.now();
    const id = await ctx.db.insert('pages', {
      userId,
      sessionId,
      storageKey,
      order: existing.length,
      createdAt: now,
    });
    await ctx.db.patch(sessionId, { updatedAt: now });
    return id;
  },
});

/** Swap a page with its neighbour: -1 moves it earlier, 1 later. */
export const move = mutation({
  args: { pageId: v.id('pages'), direction: v.union(v.literal(-1), v.literal(1)) },
  handler: async (ctx, { pageId, direction }): Promise<void> => {
    const { page } = await requireOwnPage(ctx, pageId);
    const pages = await pagesOf(ctx, page.sessionId);
    const neighbour = pages.find((p) => p.order === page.order + direction);
    if (!neighbour) return; // already first / last
    await ctx.db.patch(page._id, { order: neighbour.order });
    await ctx.db.patch(neighbour._id, { order: page.order });
  },
});

/** Retake: point the page at a new photo and delete the old one from R2. */
export const replace = mutation({
  args: { pageId: v.id('pages'), storageKey: v.string() },
  handler: async (ctx, { pageId, storageKey }): Promise<void> => {
    const { page } = await requireOwnPage(ctx, pageId);
    const oldKey = page.storageKey;
    await ctx.db.patch(pageId, { storageKey });
    await ctx.db.patch(page.sessionId, { updatedAt: Date.now() });
    if (oldKey !== storageKey) await r2.deleteObject(ctx, oldKey);
  },
});

/** Delete a page and its photo; later pages move up. */
export const remove = mutation({
  args: { pageId: v.id('pages') },
  handler: async (ctx, { pageId }): Promise<void> => {
    const { page } = await requireOwnPage(ctx, pageId);
    await ctx.db.delete(pageId);
    await r2.deleteObject(ctx, page.storageKey);
    await renumber(ctx, page.sessionId);
    await ctx.db.patch(page.sessionId, { updatedAt: Date.now() });
  },
});

/** For permanent session deletes: remove every page row and photo. */
export const deleteAllPages = async (
  ctx: MutationCtx,
  sessionId: Id<'sessions'>,
): Promise<void> => {
  for (const page of await pagesOf(ctx, sessionId)) {
    await ctx.db.delete(page._id);
    await r2.deleteObject(ctx, page.storageKey);
  }
};
