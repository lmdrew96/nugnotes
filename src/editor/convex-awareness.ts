import {
  type Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  outdatedTimeout,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import { api } from '../../convex/_generated/api';
import type { SyncClient } from './convex-provider';

/**
 * Shares this tab's cursor in a study room's notes with everyone else in the
 * room, through Convex (convex/ydocAwareness.ts), and shows theirs. BlockNote
 * draws the cursors from the Yjs `awareness` passed to it; this keeps that
 * awareness in step with the server.
 *
 * Out: whenever the local state changes (the cursor moves, the name or colour
 * is set), send it — at most every SEND_EVERY_MS. y-protocols also renews the
 * local state every ~15s, which doubles as a heartbeat.
 *
 * In: subscribe to the room's rows and apply everyone else's. A row that
 * hasn't been refreshed within y-protocols' 30s timeout belongs to a tab that
 * went away without saying so, and is skipped; rows that disappear (the tab
 * left) take their cursor with them.
 */

const SEND_EVERY_MS = 200;

/** Origin tag for states applied from the server, so they aren't sent back. */
const REMOTE = Symbol('convex-awareness');

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] };

const toArrayBuffer = (u: Uint8Array): ArrayBuffer =>
  u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export type AwarenessHandle = { destroy(): Promise<void> };

export function attachConvexAwareness({
  client,
  docKey,
  awareness,
}: {
  client: SyncClient;
  docKey: string;
  awareness: Awareness;
}): AwarenessHandle {
  let destroyed = false;
  const me = awareness.clientID;

  // ---- out ----
  let sendTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSentAt = 0;
  const send = () => {
    sendTimer = null;
    if (destroyed || awareness.getLocalState() === null) return;
    lastSentAt = Date.now();
    const state = encodeAwarenessUpdate(awareness, [me]);
    client
      .mutation(api.ydocAwareness.set, { docKey, clientId: me, state: toArrayBuffer(state) })
      .catch((error: unknown) => {
        // Cursors are a nicety: a missed send is replaced by the next one.
        console.error('[notes-awareness] send failed', error);
      });
  };
  const onLocalUpdate = ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
    if (origin === REMOTE || destroyed) return;
    if (![...added, ...updated, ...removed].includes(me) || sendTimer) return;
    sendTimer = setTimeout(send, Math.max(0, lastSentAt + SEND_EVERY_MS - Date.now()));
  };
  awareness.on('update', onLocalUpdate);
  if (awareness.getLocalState() !== null) send();

  // ---- in ----
  let present = new Set<number>();
  const unsubscribe = client.onUpdate(
    api.ydocAwareness.list,
    { docKey },
    (rows) => {
      if (destroyed || rows === null) return;
      const now = Date.now();
      const live = rows.filter((r) => r.clientId !== me && now - r.updatedAt < outdatedTimeout);
      for (const r of live) applyAwarenessUpdate(awareness, new Uint8Array(r.state), REMOTE);
      const ids = new Set(live.map((r) => r.clientId));
      const gone = [...present].filter((id) => !ids.has(id));
      if (gone.length) removeAwarenessStates(awareness, gone, REMOTE);
      present = ids;
    },
    (error) => console.error('[notes-awareness] subscription error', error),
  );

  return {
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      awareness.off('update', onLocalUpdate);
      if (sendTimer) clearTimeout(sendTimer);
      unsubscribe();
      removeAwarenessStates(awareness, [...present], REMOTE);
      try {
        await client.mutation(api.ydocAwareness.remove, { docKey, clientId: me });
      } catch (error) {
        // The row goes stale and is ignored after 30s anyway.
        console.error('[notes-awareness] leave failed', error);
      }
    },
  };
}
