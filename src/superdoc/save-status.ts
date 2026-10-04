/**
 * "Has this note's latest edit reached the server?" — shared by the sync
 * provider (inside SuperDoc's collaboration worker) and the page.
 *
 * SuperDoc has no flush API, and an edit typed shortly before the editor
 * unmounts is lost: it was still between the page and the worker, or queued in
 * the worker, when the worker was torn down. So the worker reports its own
 * state over a BroadcastChannel, and the page holds navigation until the note
 * is saved.
 */

export const SAVE_STATUS_CHANNEL = 'nugnotes-save-status';

/** Posted by the worker whenever its unpushed state changes. */
export interface SaveStatusMessage {
  docKey: string;
  /** The worker holds local edits Convex hasn't acknowledged yet. */
  unpushed: boolean;
  /** When the worker's Y.Doc last received a local edit (Date.now, same machine as the page). */
  lastLocalUpdateAt: number;
}

/** Quiet time after the last keystroke before we trust the worker has caught up. */
export const QUIET_MS = 750;
/** The page may record an edit a moment after the worker applies it. */
export const ARRIVAL_SLACK_MS = 200;

export interface SaveState {
  now: number;
  /** When the page last saw an edit (0 = none since the editor opened). */
  lastEditAt: number;
  /** Latest worker report (0 / false until the first one arrives). */
  workerLastLocalUpdateAt: number;
  workerUnpushed: boolean;
}

export function isNoteSaved({
  now,
  lastEditAt,
  workerLastLocalUpdateAt,
  workerUnpushed,
}: SaveState): boolean {
  if (lastEditAt === 0) return !workerUnpushed;
  // Typing just now: the edit may not have left the page yet.
  if (now - lastEditAt < QUIET_MS) return false;
  // The worker hasn't seen the latest edit.
  if (workerLastLocalUpdateAt < lastEditAt - ARRIVAL_SLACK_MS) return false;
  return !workerUnpushed;
}
