import { ConvexError, v } from 'convex/values';
import { type MutationCtx, type QueryCtx, mutation, query } from './_generated/server';
import { canEditDoc } from './ydoc';
import { parseDocKey } from './ydocKeys';

/**
 * Live cursors for a study room's shared notes. Each open editor tab keeps one
 * row holding its Yjs awareness state (the student's name, colour and cursor),
 * written by src/editor/convex-awareness.ts and read back by everyone in the
 * room. Rows go away when the tab leaves; a tab that vanishes without saying
 * so stops refreshing its row, and readers ignore it after a short while.
 *
 * Only room notes have cursors — a session's notes have one editor.
 */

/** Largest awareness state accepted. A name, a colour and a cursor fit easily. */
const MAX_STATE_BYTES = 4_000;
/** A writer's other rows in the same note older than this are dead tabs. */
const DEAD_TAB_MS = 60_000;

/** Signed-in member of the room whose notes these are, or null. */
const roomMember = async (ctx: QueryCtx | MutationCtx, docKey: string): Promise<string | null> => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  if (parseDocKey(docKey)?.kind !== 'room') return null;
  return (await canEditDoc(ctx, docKey, identity.subject)) ? identity.subject : null;
};

/** Everyone's awareness rows for a room note. Null for no access. */
export const list = query({
  args: { docKey: v.string() },
  handler: async (ctx, { docKey }) => {
    if (!(await roomMember(ctx, docKey))) return null;
    const rows = await ctx.db
      .query('ydocAwareness')
      .withIndex('by_doc', (q) => q.eq('docKey', docKey))
      .collect();
    return rows.map((r) => ({ clientId: r.clientId, state: r.state, updatedAt: r.updatedAt }));
  },
});

/** Save this tab's awareness state (its cursor moved, or a periodic refresh). */
export const set = mutation({
  args: { docKey: v.string(), clientId: v.number(), state: v.bytes() },
  handler: async (ctx, { docKey, clientId, state }) => {
    const userId = await roomMember(ctx, docKey);
    if (!userId) throw new ConvexError({ code: 'NOT_FOUND' });
    if (state.byteLength > MAX_STATE_BYTES) {
      throw new ConvexError({ code: 'STATE_TOO_LARGE', bytes: state.byteLength });
    }

    const now = Date.now();
    const rows = await ctx.db
      .query('ydocAwareness')
      .withIndex('by_doc', (q) => q.eq('docKey', docKey))
      .collect();
    const own = rows.find((r) => r.clientId === clientId);
    if (own && own.userId !== userId) throw new ConvexError({ code: 'NOT_FOUND' });
    if (own) await ctx.db.patch(own._id, { state, updatedAt: now });
    else await ctx.db.insert('ydocAwareness', { docKey, userId, clientId, state, updatedAt: now });

    // Tabs of this student's that closed without saying so (crash, lost wifi).
    for (const r of rows) {
      if (r.userId === userId && r.clientId !== clientId && now - r.updatedAt > DEAD_TAB_MS) {
        await ctx.db.delete(r._id);
      }
    }
  },
});

/** This tab is leaving the note. */
export const remove = mutation({
  args: { docKey: v.string(), clientId: v.number() },
  handler: async (ctx, { docKey, clientId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: 'NOT_AUTHENTICATED' });
    const row = await ctx.db
      .query('ydocAwareness')
      .withIndex('by_doc_client', (q) => q.eq('docKey', docKey).eq('clientId', clientId))
      .unique();
    if (row && row.userId === identity.subject) await ctx.db.delete(row._id);
  },
});
