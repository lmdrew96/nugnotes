// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// Ported from Folio's convex/ydoc.test.ts, with NugNotes' two document kinds:
// a session's notes (owner only) and a study room's notes (open-room members).
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { api, internal } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import schema from '../convex/schema';
import {
  COMPACT_AT,
  INLINE_SNAPSHOT_MAX_BYTES,
  MAX_UPDATE_BYTES,
  STALE_CLAIM_MS,
} from '../convex/ydoc';
import { roomDocKey, sessionDocKey } from '../convex/ydocKeys';

const modules = import.meta.glob('../convex/**/*.*s');
const newTest = () => convexTest(schema, modules);

const ALICE = { subject: 'user_alice' };
const BOB = { subject: 'user_bob' };
const MALLORY = { subject: 'user_mallory' };

const toBuffer = (u: Uint8Array): ArrayBuffer =>
  u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

/** Each call returns one Yjs update that inserts `text` at the end. */
function typist() {
  const doc = new Y.Doc();
  const updates: Uint8Array[] = [];
  doc.on('update', (u: Uint8Array) => updates.push(u));
  return (text: string) => {
    doc.getText('t').insert(doc.getText('t').length, text);
    const last = updates.at(-1);
    if (!last) throw new Error('no update emitted');
    return toBuffer(last);
  };
}

describe('convex/ydoc', () => {
  let t: ReturnType<typeof newTest>;
  let sessionId: Id<'sessions'>;
  let docKey: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = newTest();
    sessionId = await t.run((ctx) =>
      ctx.db.insert('sessions', {
        userId: ALICE.subject,
        title: 'Test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isDeleted: false,
      }),
    );
    docKey = sessionDocKey(sessionId);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const alice = () => t.withIdentity(ALICE);

  /** Every stored row, rebuilt into a fresh doc's text — what a new client sees. */
  async function textFromServer(key = docKey): Promise<string> {
    const parts = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query('ydocUpdates')
        .withIndex('by_doc', (q) => q.eq('docKey', key))
        .collect();
      // t.run results must be Convex values: ArrayBuffer, not Uint8Array.
      return Promise.all(
        rows.map(async (r) => {
          if (r.update) return r.update;
          const blob = r.storageId ? await ctx.storage.get(r.storageId) : null;
          if (!blob) throw new Error('snapshot blob missing');
          return await blob.arrayBuffer();
        }),
      );
    });
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Y.mergeUpdates(parts.map((p) => new Uint8Array(p))));
    return doc.getText('t').toString();
  }

  describe('claimRoom', () => {
    it('creates once, makes a concurrent opener wait, then everyone joins', async () => {
      expect(await alice().mutation(api.ydoc.claimRoom, { docKey, claimToken: 'tab-a' })).toBe(
        'create',
      );
      // The same editor remounting before it wrote anything keeps its claim.
      expect(await alice().mutation(api.ydoc.claimRoom, { docKey, claimToken: 'tab-a' })).toBe(
        'create',
      );
      // Another tab before the first has written anything has to wait.
      expect(await alice().mutation(api.ydoc.claimRoom, { docKey, claimToken: 'tab-b' })).toBe(
        'wait',
      );
      await alice().mutation(api.ydoc.push, { docKey, update: typist()('hi') });
      expect(await alice().mutation(api.ydoc.claimRoom, { docKey, claimToken: 'tab-a' })).toBe(
        'join',
      );
    });

    it('lets a stale, never-written claim be taken over', async () => {
      await alice().mutation(api.ydoc.claimRoom, { docKey, claimToken: 'tab-a' });
      vi.advanceTimersByTime(STALE_CLAIM_MS + 1);
      expect(await alice().mutation(api.ydoc.claimRoom, { docKey, claimToken: 'tab-b' })).toBe(
        'create',
      );
    });

    it('refuses someone who does not own the session', async () => {
      await expect(
        t.withIdentity(MALLORY).mutation(api.ydoc.claimRoom, { docKey, claimToken: 'tab-a' }),
      ).rejects.toThrow(/NOT_FOUND/);
    });

    it('refuses a trashed session and a malformed key', async () => {
      await t.run((ctx) => ctx.db.patch(sessionId, { isDeleted: true }));
      await expect(
        alice().mutation(api.ydoc.claimRoom, { docKey, claimToken: 'tab-a' }),
      ).rejects.toThrow(/NOT_FOUND/);
      await expect(
        alice().mutation(api.ydoc.claimRoom, { docKey: 'nonsense', claimToken: 'tab-a' }),
      ).rejects.toThrow(/NOT_FOUND/);
    });
  });

  describe('study room notes', () => {
    let roomId: Id<'studyRooms'>;
    let roomKey: string;

    beforeEach(async () => {
      roomId = await t.run(async (ctx) => {
        const id = await ctx.db.insert('studyRooms', {
          name: 'Bio',
          hostUserId: ALICE.subject,
          isActive: true,
          createdAt: Date.now(),
        });
        for (const [userId, role] of [
          [ALICE.subject, 'host'],
          [BOB.subject, 'member'],
        ]) {
          await ctx.db.insert('studyRoomMembers', {
            roomId: id,
            userId,
            role,
            hasJoined: true,
            lastSeenAt: Date.now(),
            createdAt: Date.now(),
          });
        }
        return id;
      });
      roomKey = roomDocKey(roomId);
    });

    it('lets every member edit and keeps non-members out', async () => {
      await alice().mutation(api.ydoc.claimRoom, { docKey: roomKey, claimToken: 'tab-a' });
      await alice().mutation(api.ydoc.push, { docKey: roomKey, update: typist()('shared') });
      expect(
        await t
          .withIdentity(BOB)
          .mutation(api.ydoc.claimRoom, { docKey: roomKey, claimToken: 'tab-b' }),
      ).toBe('join');
      expect(await t.withIdentity(MALLORY).query(api.ydoc.head, { docKey: roomKey })).toBeNull();
      expect(await textFromServer(roomKey)).toBe('shared');
    });

    it('locks the notes once the room closes', async () => {
      await alice().mutation(api.ydoc.claimRoom, { docKey: roomKey, claimToken: 'tab-a' });
      await t.run((ctx) => ctx.db.patch(roomId, { isActive: false }));
      await expect(
        t.withIdentity(BOB).mutation(api.ydoc.push, { docKey: roomKey, update: typist()('late') }),
      ).rejects.toThrow(/NOT_FOUND/);
    });
  });

  describe('push / head / since', () => {
    it('returns only rows after the given time, oldest first', async () => {
      await alice().mutation(api.ydoc.claimRoom, { docKey, claimToken: 'tab-a' });
      const type = typist();
      await alice().mutation(api.ydoc.push, { docKey, update: type('a') });
      vi.advanceTimersByTime(5);
      await alice().mutation(api.ydoc.push, { docKey, update: type('b') });

      const all = await alice().query(api.ydoc.since, { docKey, after: 0 });
      if (!all) throw new Error('no access');
      expect(all).toHaveLength(2);
      expect(all[0].createdAt).toBeLessThan(all[1].createdAt);

      const later = await alice().query(api.ydoc.since, { docKey, after: all[0].createdAt });
      expect(later?.map((r) => r.id)).toEqual([all[1].id]);

      const head = await alice().query(api.ydoc.head, { docKey });
      expect(head).toEqual({ latest: all[1].createdAt, count: 2 });
    });

    it('hides everything from someone without access', async () => {
      await alice().mutation(api.ydoc.claimRoom, { docKey, claimToken: 'tab-a' });
      await alice().mutation(api.ydoc.push, { docKey, update: typist()('secret') });
      const mallory = t.withIdentity(MALLORY);
      expect(await mallory.query(api.ydoc.head, { docKey })).toBeNull();
      expect(await mallory.query(api.ydoc.since, { docKey, after: 0 })).toBeNull();
      await expect(
        mallory.mutation(api.ydoc.push, { docKey, update: typist()('x') }),
      ).rejects.toThrow(/NOT_FOUND/);
    });

    it('rejects oversized updates and pushes without a room', async () => {
      await expect(
        alice().mutation(api.ydoc.push, { docKey, update: typist()('x') }),
      ).rejects.toThrow(/NO_ROOM/);
      await alice().mutation(api.ydoc.claimRoom, { docKey, claimToken: 'tab-a' });
      await expect(
        alice().mutation(api.ydoc.push, { docKey, update: new ArrayBuffer(MAX_UPDATE_BYTES + 1) }),
      ).rejects.toThrow(/UPDATE_TOO_LARGE/);
    });
  });

  describe('compaction', () => {
    it(`merges ${COMPACT_AT} updates into one inline snapshot without losing text`, async () => {
      await alice().mutation(api.ydoc.claimRoom, { docKey, claimToken: 'tab-a' });
      const type = typist();
      let expected = '';
      for (let i = 0; i < COMPACT_AT; i++) {
        const chunk = `w${i} `;
        expected += chunk;
        await alice().mutation(api.ydoc.push, { docKey, update: type(chunk) });
      }
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const rows = await t.run((ctx) =>
        ctx.db
          .query('ydocUpdates')
          .withIndex('by_doc', (q) => q.eq('docKey', docKey))
          .collect(),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].author).toBe('compaction');
      expect(rows[0].update).toBeDefined();
      expect(await textFromServer()).toBe(expected);

      const room = await t.run((ctx) =>
        ctx.db
          .query('ydocRooms')
          .withIndex('by_doc', (q) => q.eq('docKey', docKey))
          .unique(),
      );
      expect(room).toMatchObject({ pendingUpdates: 0, compactionScheduled: false });
    });

    it('moves a snapshot too big for a row into file storage', async () => {
      await alice().mutation(api.ydoc.claimRoom, { docKey, claimToken: 'tab-a' });
      const type = typist();
      const chunk = 'x'.repeat(Math.ceil(INLINE_SNAPSHOT_MAX_BYTES / COMPACT_AT) + 500);
      for (let i = 0; i < COMPACT_AT; i++) {
        await alice().mutation(api.ydoc.push, { docKey, update: type(chunk) });
      }
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const rows = await t.run((ctx) =>
        ctx.db
          .query('ydocUpdates')
          .withIndex('by_doc', (q) => q.eq('docKey', docKey))
          .collect(),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].storageId).toBeDefined();
      expect(rows[0].update).toBeUndefined();
      expect(await textFromServer()).toBe(chunk.repeat(COMPACT_AT));

      // A second round folds the stored snapshot in and deletes its blob.
      for (let i = 0; i < COMPACT_AT; i++) {
        await alice().mutation(api.ydoc.push, { docKey, update: type('y') });
      }
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const blobs = await t.run((ctx) => ctx.db.system.query('_storage').collect());
      expect(blobs).toHaveLength(1);
      expect(await textFromServer()).toBe(chunk.repeat(COMPACT_AT) + 'y'.repeat(COMPACT_AT));
    });

    it('keeps rows pushed after compaction loaded its input', async () => {
      await alice().mutation(api.ydoc.claimRoom, { docKey, claimToken: 'tab-a' });
      const type = typist();
      await alice().mutation(api.ydoc.push, { docKey, update: type('a') });
      const loaded = await t.query(internal.ydoc.loadForCompaction, { docKey });
      await alice().mutation(api.ydoc.push, { docKey, update: type('b') });
      await t.mutation(internal.ydoc.commitCompaction, {
        docKey,
        replaced: loaded.map((r) => r.id),
        update: toBuffer(
          Y.mergeUpdates(
            loaded.map((r) => (r.update ? new Uint8Array(r.update) : new Uint8Array())),
          ),
        ),
      });
      expect(await textFromServer()).toBe('ab');
    });
  });

  it('copying a shared session gives the copy its own note, file snapshots included', async () => {
    await alice().mutation(api.ydoc.claimRoom, { docKey, claimToken: 'tab-a' });
    const type = typist();
    const chunk = 'c'.repeat(Math.ceil(INLINE_SNAPSHOT_MAX_BYTES / COMPACT_AT) + 500);
    for (let i = 0; i < COMPACT_AT; i++) {
      await alice().mutation(api.ydoc.push, { docKey, update: type(chunk) });
    }
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await alice().mutation(api.ydoc.push, { docKey, update: type('!') }); // an inline row too
    await t.run((ctx) =>
      ctx.db.insert('sharedSessions', {
        sessionId,
        ownerId: ALICE.subject,
        sharedWithUserId: BOB.subject,
        permission: 'view',
        sharedAt: Date.now(),
      }),
    );

    const copyId = await t
      .withIdentity(BOB)
      .mutation(api.sessionSharing.copyToLibrary, { sessionId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const copyKey = sessionDocKey(copyId);
    expect(await textFromServer(copyKey)).toBe(`${chunk.repeat(COMPACT_AT)}!`);
    expect(
      await t.withIdentity(BOB).mutation(api.ydoc.claimRoom, { docKey: copyKey, claimToken: 'b' }),
    ).toBe('join');

    // Deleting the original must not touch the copy.
    await alice().mutation(api.sessions.permanentDelete, { id: sessionId });
    expect(await textFromServer(copyKey)).toBe(`${chunk.repeat(COMPACT_AT)}!`);
  });

  it('permanently deleting a session removes its room, updates and blobs', async () => {
    await alice().mutation(api.ydoc.claimRoom, { docKey, claimToken: 'tab-a' });
    const type = typist();
    const chunk = 'z'.repeat(Math.ceil(INLINE_SNAPSHOT_MAX_BYTES / COMPACT_AT) + 500);
    for (let i = 0; i < COMPACT_AT; i++) {
      await alice().mutation(api.ydoc.push, { docKey, update: type(chunk) });
    }
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await alice().mutation(api.sessions.permanentDelete, { id: sessionId });

    const left = await t.run(async (ctx) => ({
      updates: await ctx.db.query('ydocUpdates').collect(),
      rooms: await ctx.db.query('ydocRooms').collect(),
      blobs: await ctx.db.system.query('_storage').collect(),
    }));
    expect(left).toEqual({ updates: [], rooms: [], blobs: [] });
  });
});
