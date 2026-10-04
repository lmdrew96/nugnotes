/**
 * A one-slot registry for "this tab has editor work that may not be on the
 * server yet" (ported from Folio).
 *
 * The update toast lives at the app root; the editor that owns the pending save
 * lives several levels below it, and only one notes editor is mounted at a
 * time. A module-level slot beats threading a context through the whole tree
 * for a single function.
 */
type Flush = () => Promise<boolean>;

let pendingFlush: Flush | null = null;

/** Called by the editor on mount; returns its own cleanup. */
export function registerPendingSaveFlush(flush: Flush): () => void {
  pendingFlush = flush;
  return () => {
    // Only clear our own slot — a remount can register the next editor before
    // the previous one's cleanup runs.
    if (pendingFlush === flush) pendingFlush = null;
  };
}

/**
 * Push any pending edit to the server and report whether everything landed.
 * `true` also covers "there was no editor mounted" — nothing to lose. A
 * `false` is the caller's cue to warn instead of reloading.
 */
export async function flushPendingSaves(): Promise<boolean> {
  if (!pendingFlush) return true;
  try {
    return await pendingFlush();
  } catch (error) {
    console.error('NugNotes: flush before reload failed', error);
    return false;
  }
}
