import { ConvexError, v } from 'convex/values';
import * as Y from 'yjs';
import { internal } from './_generated/api';
import {
  type MutationCtx,
  type QueryCtx,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { parseDocKey } from './ydocKeys';

/**
 * Note persistence (ported from Folio): a note's Y.Doc lives here as an
 * append-only log of Yjs updates (`ydocUpdates`), written and read by the
 * notes editor's sync provider (src/editor/convex-provider.ts). Documents are
 * keyed by a DocKey (convex/ydocKeys.ts): a session's notes or a study room's
 * shared notes.
 *
 * Sync protocol, per open editor:
 *   1. claimRoom, so the document has a room row.
 *   2. Subscribe to `head` — a tiny marker that changes on every write.
 *   3. When it changes, fetch `since(after)` — only the rows you're missing —
 *      and apply them. Yjs updates are idempotent, so overlap is harmless;
 *      the client deliberately re-reads a small window to stay safe.
 *   4. Push local updates with `push`.
 * Subscribing to the full log instead would re-send the whole document on
 * every keystroke batch, to every open tab.
 *
 * Compaction merges a run of update rows into one snapshot row once enough
 * pile up, so opening a note never means replaying thousands of rows.
 */

/** Update rows since the last compaction before another is scheduled. */
export const COMPACT_AT = 100;
/** Largest single update `push` accepts — a Convex value caps at 1 MiB. */
export const MAX_UPDATE_BYTES = 900_000;
/** Snapshots larger than this go to file storage instead of an inline row. */
export const INLINE_SNAPSHOT_MAX_BYTES = 800_000;
/** A "create" claim whose tab never wrote anything is abandoned after this. */
export const STALE_CLAIM_MS = 60_000;

/**
 * Whether `userId` may read and write this document: a session's owner (while
 * it isn't trashed), or a member of a study room that's still open. Viewers of
 * shared sessions never come through here — they read the saved markdown.
 */
export async function canEditDoc(
  ctx: QueryCtx | MutationCtx,
  docKey: string,
  userId: string,
): Promise<boolean> {
  const parsed = parseDocKey(docKey);
  if (!parsed) return false;
  if (parsed.kind === 'session') {
    const id = ctx.db.normalizeId('sessions', parsed.id);
    const session = id ? await ctx.db.get(id) : null;
    return !!session && session.userId === userId && !session.isDeleted;
  }
  const roomId = ctx.db.normalizeId('studyRooms', parsed.id);
  const room = roomId ? await ctx.db.get(roomId) : null;
  if (!roomId || !room?.isActive) return false;
  const member = await ctx.db
    .query('studyRoomMembers')
    .withIndex('by_room_user', (q) => q.eq('roomId', roomId).eq('userId', userId))
    .unique();
  return !!member;
}

const roomFor = (ctx: QueryCtx | MutationCtx, docKey: string) =>
  ctx.db
    .query('ydocRooms')
    .withIndex('by_doc', (q) => q.eq('docKey', docKey))
    .unique();

const hasAnyUpdate = async (ctx: QueryCtx | MutationCtx, docKey: string) =>
  (await ctx.db
    .query('ydocUpdates')
    .withIndex('by_doc', (q) => q.eq('docKey', docKey))
    .first()) !== null;

/**
 * Make sure this document has a room row (push needs one) and decide,
 * atomically, whether the caller creates the room or joins it. The BlockNote
 * editor (v0.4.0+) only needs the row and ignores the answer; create-vs-join
 * mattered to SuperDoc, which needed exactly one tab to seed a new room.
 *   - no room row           → claim it, "create"
 *   - room has content      → "join"
 *   - claimed by this same editor (`claimToken`), still empty → "create" again
 *                             (the editor remounted before writing anything)
 *   - claimed elsewhere, still empty → "wait" (the claimer is seeding it),
 *                             unless the claim is stale — then take it over
 */
export const claimRoom = mutation({
  args: { docKey: v.string(), claimToken: v.string() },
  handler: async (ctx, { docKey, claimToken }): Promise<'create' | 'join' | 'wait'> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: 'NOT_AUTHENTICATED' });
    if (!(await canEditDoc(ctx, docKey, identity.subject))) {
      throw new ConvexError({ code: 'NOT_FOUND' });
    }

    const now = Date.now();
    const room = await roomFor(ctx, docKey);
    if (!room) {
      await ctx.db.insert('ydocRooms', {
        docKey,
        claimedBy: identity.subject,
        claimToken,
        claimedAt: now,
        pendingUpdates: 0,
        compactionScheduled: false,
      });
      return 'create';
    }
    if (await hasAnyUpdate(ctx, docKey)) return 'join';
    if (room.claimToken === claimToken) return 'create';
    if (now - room.claimedAt < STALE_CLAIM_MS) return 'wait';
    await ctx.db.patch(room._id, { claimedBy: identity.subject, claimToken, claimedAt: now });
    return 'create';
  },
});

/** A small marker that changes on every write — what clients subscribe to.
 *  `count` is there so a row that commits with an *older* timestamp than the
 *  newest (which wouldn't move `latest`) still wakes subscribers. Compaction
 *  keeps the row count small, so counting is cheap. Null for no access. */
export const head = query({
  args: { docKey: v.string() },
  handler: async (ctx, { docKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    if (!(await canEditDoc(ctx, docKey, identity.subject))) return null;
    const rows = await ctx.db
      .query('ydocUpdates')
      .withIndex('by_doc', (q) => q.eq('docKey', docKey))
      .collect();
    return {
      latest: rows.length ? Math.max(...rows.map((r) => r._creationTime)) : null,
      count: rows.length,
    };
  },
});

/** Rows created after `after` (a _creationTime), oldest first. A snapshot
 *  held in file storage comes back as a URL for the client to fetch. */
export const since = query({
  args: { docKey: v.string(), after: v.number() },
  handler: async (ctx, { docKey, after }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    if (!(await canEditDoc(ctx, docKey, identity.subject))) return null;
    const rows = await ctx.db
      .query('ydocUpdates')
      .withIndex('by_doc', (q) => q.eq('docKey', docKey).gt('_creationTime', after))
      .collect();
    return await Promise.all(
      rows.map(async (r) => ({
        id: r._id,
        createdAt: r._creationTime,
        update: r.update ?? null,
        url: r.storageId ? await ctx.storage.getUrl(r.storageId) : null,
      })),
    );
  },
});

/** Append one (possibly merged) Yjs update from an editor. */
export const push = mutation({
  args: { docKey: v.string(), update: v.bytes() },
  handler: async (ctx, { docKey, update }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: 'NOT_AUTHENTICATED' });
    if (!(await canEditDoc(ctx, docKey, identity.subject))) {
      throw new ConvexError({ code: 'NOT_FOUND' });
    }
    if (update.byteLength > MAX_UPDATE_BYTES) {
      // ConvexError, not Error: prod redacts plain messages, and the client
      // needs to know a retry can't help.
      throw new ConvexError({ code: 'UPDATE_TOO_LARGE', bytes: update.byteLength });
    }
    const room = await roomFor(ctx, docKey);
    if (!room) throw new ConvexError({ code: 'NO_ROOM' });

    await ctx.db.insert('ydocUpdates', { docKey, update, author: identity.subject });

    const pendingUpdates = room.pendingUpdates + 1;
    const compact = pendingUpdates >= COMPACT_AT && !room.compactionScheduled;
    await ctx.db.patch(room._id, {
      pendingUpdates,
      ...(compact ? { compactionScheduled: true } : {}),
    });
    if (compact) await ctx.scheduler.runAfter(0, internal.ydoc.compact, { docKey });
  },
});

// --- compaction (internal) ---

export const loadForCompaction = internalQuery({
  args: { docKey: v.string() },
  handler: async (ctx, { docKey }) => {
    const rows = await ctx.db
      .query('ydocUpdates')
      .withIndex('by_doc', (q) => q.eq('docKey', docKey))
      .collect();
    return rows.map((r) => ({
      id: r._id,
      update: r.update ?? null,
      storageId: r.storageId ?? null,
    }));
  },
});

/**
 * Merge every current row into one snapshot. Uses Y.mergeUpdates, which is
 * lossless — not a GC'd re-encode — because an editor may rely on deleted
 * content (undo history, positions) that garbage collection would drop.
 * Rows pushed while this runs aren't in `replaced`, so they survive untouched.
 */
export const compact = internalAction({
  args: { docKey: v.string() },
  handler: async (ctx, { docKey }) => {
    const rows = await ctx.runQuery(internal.ydoc.loadForCompaction, { docKey });
    if (rows.length < 2) {
      await ctx.runMutation(internal.ydoc.commitCompaction, { docKey, replaced: [] });
      return;
    }
    const parts: Uint8Array[] = [];
    for (const r of rows) {
      if (r.update) {
        parts.push(new Uint8Array(r.update));
      } else if (r.storageId) {
        const blob = await ctx.storage.get(r.storageId);
        if (!blob) throw new Error(`Snapshot blob missing for ${docKey}`);
        parts.push(new Uint8Array(await blob.arrayBuffer()));
      }
    }
    const merged = Y.mergeUpdates(parts);
    const bytes = merged.buffer.slice(
      merged.byteOffset,
      merged.byteOffset + merged.byteLength,
    ) as ArrayBuffer;

    if (bytes.byteLength > INLINE_SNAPSHOT_MAX_BYTES) {
      const storageId = await ctx.storage.store(new Blob([bytes]));
      await ctx.runMutation(internal.ydoc.commitCompaction, {
        docKey,
        replaced: rows.map((r) => r.id),
        storageId,
      });
    } else {
      await ctx.runMutation(internal.ydoc.commitCompaction, {
        docKey,
        replaced: rows.map((r) => r.id),
        update: bytes,
      });
    }
  },
});

export const commitCompaction = internalMutation({
  args: {
    docKey: v.string(),
    replaced: v.array(v.id('ydocUpdates')),
    update: v.optional(v.bytes()),
    storageId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, { docKey, replaced, update, storageId }) => {
    const room = await roomFor(ctx, docKey);
    if (!room) {
      // Document purged mid-compaction — don't leave an orphaned blob.
      if (storageId) await ctx.storage.delete(storageId);
      return;
    }
    if (replaced.length > 0) {
      // Insert first, then delete: a reader between the two can only see
      // duplicate content, which Yjs ignores — never missing content.
      await ctx.db.insert('ydocUpdates', {
        docKey,
        author: 'compaction',
        ...(update ? { update } : {}),
        ...(storageId ? { storageId } : {}),
      });
      for (const id of replaced) {
        const row = await ctx.db.get(id);
        if (!row) continue;
        if (row.storageId) await ctx.storage.delete(row.storageId);
        await ctx.db.delete(id);
      }
    }
    const remaining = await ctx.db
      .query('ydocUpdates')
      .withIndex('by_doc', (q) => q.eq('docKey', docKey))
      .collect();
    await ctx.db.patch(room._id, {
      pendingUpdates: remaining.filter((r) => r.author !== 'compaction').length,
      compactionScheduled: false,
    });
  },
});

/**
 * Give `toKey` its own copy of `fromKey`'s note, so the copy opens with "join"
 * and the two documents never share storage. Used by "copy to my library".
 * Inline rows are copied here; a snapshot held in file storage can only be
 * read and re-stored by an action, so those are copied just after — a copy
 * opened in between catches up, since the sync pulls rows as they land.
 */
export async function copyRoomData(
  ctx: MutationCtx,
  fromKey: string,
  toKey: string,
  author: string,
) {
  const rows = await ctx.db
    .query('ydocUpdates')
    .withIndex('by_doc', (q) => q.eq('docKey', fromKey))
    .collect();
  if (rows.length === 0) return;
  for (const r of rows) {
    if (r.update) {
      await ctx.db.insert('ydocUpdates', { docKey: toKey, author, update: r.update });
    } else if (r.storageId) {
      await ctx.scheduler.runAfter(0, internal.ydoc.copySnapshotBlob, {
        docKey: toKey,
        storageId: r.storageId,
        author,
      });
    }
  }
  await ctx.db.insert('ydocRooms', {
    docKey: toKey,
    claimedBy: author,
    claimedAt: Date.now(),
    pendingUpdates: rows.length,
    compactionScheduled: false,
  });
}

export const copySnapshotBlob = internalAction({
  args: { docKey: v.string(), storageId: v.id('_storage'), author: v.string() },
  handler: async (ctx, { docKey, storageId, author }) => {
    const blob = await ctx.storage.get(storageId);
    if (!blob) throw new Error(`Snapshot blob missing while copying into ${docKey}`);
    const copy = await ctx.storage.store(blob);
    await ctx.runMutation(internal.ydoc.insertSnapshotRow, { docKey, storageId: copy, author });
  },
});

export const insertSnapshotRow = internalMutation({
  args: { docKey: v.string(), storageId: v.id('_storage'), author: v.string() },
  handler: async (ctx, { docKey, storageId, author }) => {
    if (!(await roomFor(ctx, docKey))) {
      // The copy was deleted before its snapshot arrived.
      await ctx.storage.delete(storageId);
      return;
    }
    await ctx.db.insert('ydocUpdates', { docKey, author, storageId });
  },
});

/** Hard-delete a document's room and every update/snapshot (and blob). Used
 *  when a session is permanently deleted. */
export async function deleteRoomData(ctx: MutationCtx, docKey: string) {
  const rows = await ctx.db
    .query('ydocUpdates')
    .withIndex('by_doc', (q) => q.eq('docKey', docKey))
    .collect();
  for (const r of rows) {
    if (r.storageId) await ctx.storage.delete(r.storageId);
    await ctx.db.delete(r._id);
  }
  const room = await roomFor(ctx, docKey);
  if (room) await ctx.db.delete(room._id);
}
