import { type Theme, useTheme } from '@/components/theme-provider';
import { registerPendingSaveFlush } from '@/lib/pending-save';
import { YUndoExtension, withCollaboration } from '@blocknote/core/yjs';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { useUploadFile } from '@convex-dev/r2/react';
import '@blocknote/shadcn/style.css';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useBlocker } from '@tanstack/react-router';
import { ConvexClient } from 'convex/browser';
import { useMutation } from 'convex/react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { yUndoPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { api } from '../../../convex/_generated/api';
import type { DocKey } from '../../../convex/ydocKeys';
import { attachConvexSync } from '../../editor/convex-provider';
import { blocksToPlainText } from '../../editor/plain-text';
import { macSelectionShortcuts, notesSchema } from '../../editor/schema';
import { NotesFormattingToolbar } from '../../editor/toolbar';
import { undoSelection } from '../../editor/undo-selection';

/** Quiet time after an edit before the plain-text and markdown copies are rebuilt. */
const EXTRACT_DEBOUNCE_MS = 1000;
/** Longest we hold navigation waiting for the last edit to save. */
const SAVE_WAIT_MS = 4000;
/** Where BlockNote keeps the note inside its Y.Doc. */
const FRAGMENT = 'blocknote';
const DARK_THEMES = new Set<Theme>([
  'blackout',
  'chaos-cat',
  'high-contrast-dark',
  'nyan-cat-dark',
]);

type Connection = 'connecting' | 'synced' | 'degraded' | 'failed';

/** What the editor hands back after edits settle. */
export interface NotesSnapshot {
  /** Paragraphs separated by blank lines — what the AI features read. */
  plainText: string;
  /** For read-only views (shared sessions, rooms, exam viewer). */
  markdown: string;
}

export interface NotesEditorHandle {
  /** Rebuild and hand back the snapshot now (e.g. before generating notes). */
  flush(): Promise<void>;
  /** Wait (up to a few seconds) until the latest edit has reached the server. */
  waitUntilSaved(): Promise<boolean>;
  /** Append markdown (e.g. Nugget's generated notes) at the end of the note. */
  insertMarkdown(markdown: string): Promise<void>;
}

interface NotesEditorProps {
  docKey: DocKey;
  /** Persist the derived copies; called about a second after edits settle. */
  onSnapshot: (snapshot: NotesSnapshot) => Promise<void> | void;
  /**
   * Markdown to start an empty note from — the saved copy of a note written
   * before the BlockNote editor (v0.4.0), so it carries over on first open.
   */
  initialMarkdown?: string;
  className?: string;
}

/**
 * A note edited in BlockNote. Its Y.Doc lives in Convex (convex/ydoc.ts),
 * synced on the page by src/editor/convex-provider.ts. This component also:
 *   - rebuilds the plain-text and markdown copies after edits settle,
 *   - tells the student when edits aren't reaching the server,
 *   - holds navigation until the latest edit has saved.
 * Key it on docKey: the Y.Doc and editor are made once per note.
 */
const NotesEditor = forwardRef<NotesEditorHandle, NotesEditorProps>(function NotesEditor(
  { docKey, onSnapshot, initialMarkdown, className },
  ref,
) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const { theme } = useTheme();
  const claimRoom = useMutation(api.ydoc.claimRoom);
  const [ydoc] = useState(() => new Y.Doc());
  const [openError, setOpenError] = useState<string | null>(null);

  // Images dropped, pasted or picked in the editor go to R2 and are shown from
  // its public domain. The editor is made once, so it reads the uploader
  // through a ref.
  const uploadToR2 = useUploadFile(api.r2);
  const uploadRef = useRef(uploadToR2);
  uploadRef.current = uploadToR2;

  const editor = useCreateBlockNote(
    withCollaboration({
      schema: notesSchema,
      extensions: [macSelectionShortcuts, undoSelection],
      uploadFile: async (file: File) =>
        `${import.meta.env.VITE_R2_PUBLIC_URL}/${await uploadRef.current(file)}`,
      collaboration: {
        fragment: ydoc.getXmlFragment(FRAGMENT),
        user: { name: user?.firstName ?? 'Classmate', color: '#d97706' },
      },
    }),
    [ydoc],
  );

  // y-prosemirror destroys its undo manager when the editor view unmounts, but
  // the editor keeps the dead one — so a remount (StrictMode does one in dev)
  // leaves undo doing nothing. Re-add the undo plugin when that happens:
  // removed first, so it starts with fresh state instead of inheriting the
  // dead manager.
  useEffect(() => {
    const undoManager = yUndoPluginKey.getState(editor.prosemirrorState)?.undoManager;
    if (undoManager && !undoManager.trackedOrigins.has(undoManager)) {
      editor.unregisterExtension('yUndo');
      editor.registerExtension(YUndoExtension());
    }
  });

  // ---- sync with Convex ----
  const [connection, setConnection] = useState<Connection>('connecting');
  const connectionRef = useRef<Connection>('connecting');
  const unpushed = useRef(false);
  const synced = useRef(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchToken = useCallback(
    async () => (await getToken({ template: 'convex' })) ?? null,
    [getToken],
  );

  // ---- derived copies (plain text + markdown) ----
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  const extractTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const extract = useCallback(async (): Promise<void> => {
    // Before the first sync the editor is empty; writing that would wipe the copies.
    if (!synced.current) return;
    try {
      const blocks = editor.document;
      await onSnapshotRef.current({
        plainText: blocksToPlainText(blocks),
        markdown: editor.blocksToMarkdownLossy(blocks),
      });
    } catch (error) {
      // The Y.Doc (the real content) is unaffected; the copies catch up on
      // the next edit. Logged, not surfaced — nothing the student can do.
      console.error('NugNotes: notes snapshot failed', error);
    }
  }, [editor]);

  const scheduleExtract = useCallback(() => {
    clearTimeout(extractTimer.current);
    extractTimer.current = setTimeout(() => void extract(), EXTRACT_DEBOUNCE_MS);
  }, [extract]);

  const initialMarkdownRef = useRef(initialMarkdown);
  useEffect(() => {
    let cancelled = false;
    let sync: { destroy(): Promise<void> } | null = null;
    const setState = (state: Connection) => {
      console.debug(`NugNotes: notes sync ${connectionRef.current} → ${state}`);
      connectionRef.current = state;
      setConnection(state);
    };

    const onFirstSync = async () => {
      // A note from before BlockNote: start it from its saved markdown copy.
      const markdown = initialMarkdownRef.current?.trim();
      if (markdown && ydoc.getXmlFragment(FRAGMENT).length === 0) {
        const blocks = await editor.tryParseMarkdownToBlocks(markdown);
        if (cancelled || ydoc.getXmlFragment(FRAGMENT).length > 0) return;
        editor.replaceBlocks(editor.document, blocks);
      }
      synced.current = true;
    };

    // The server needs the document's room row before it accepts edits.
    claimRoom({ docKey, claimToken: crypto.randomUUID() })
      .then(() => {
        if (cancelled) return;
        const client = new ConvexClient(import.meta.env.VITE_CONVEX_URL);
        client.setAuth(fetchToken);
        sync = attachConvexSync({
          client,
          docKey,
          ydoc,
          callbacks: {
            onSynced: () => {
              if (!synced.current) void onFirstSync();
              setState('synced');
            },
            onDegraded: () => setState('degraded'),
            onFailed: (detail) => {
              console.error('NugNotes: notes sync failed', detail);
              setState('failed');
            },
          },
          onSaveStatus: (status) => {
            unpushed.current = status.unpushed;
          },
        });
      })
      .catch((error) => {
        console.error("NugNotes: couldn't open the notes editor", error);
        if (!cancelled) setOpenError("These notes couldn't be opened.");
      });

    return () => {
      cancelled = true;
      // destroy() sends any edits still waiting, then closes the connection.
      void sync?.destroy();
    };
  }, [claimRoom, docKey, editor, fetchToken, ydoc]);

  const unsynced = connection === 'degraded' || connection === 'failed';

  // ---- save tracking: has the latest edit reached the server? ----
  const isSaved = useCallback(() => !unpushed.current, []);

  const waitUntilSaved = useCallback(async (): Promise<boolean> => {
    if (isSaved()) return true;
    setIsSaving(true);
    try {
      const deadline = Date.now() + SAVE_WAIT_MS;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (isSaved()) return true;
      }
      console.warn('NugNotes: gave up waiting for the latest edit to save');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [isSaved]);

  // In-app navigation waits for the latest edit to save, then continues.
  // Closing or reloading the tab can't wait, so it asks instead.
  useBlocker({
    shouldBlockFn: async () => {
      await waitUntilSaved();
      return false;
    },
    enableBeforeUnload: () => !isSaved() || unsynced,
  });

  useImperativeHandle(
    ref,
    () => ({
      flush: async () => {
        clearTimeout(extractTimer.current);
        await extract();
      },
      waitUntilSaved,
      insertMarkdown: async (markdown: string) => {
        if (!synced.current) throw new Error('The editor is still opening');
        const blocks = await editor.tryParseMarkdownToBlocks(markdown);
        const last = editor.document.at(-1);
        if (last) editor.insertBlocks(blocks, last, 'after');
        else editor.replaceBlocks(editor.document, blocks);
        scheduleExtract();
      },
    }),
    [editor, extract, scheduleExtract, waitUntilSaved],
  );

  // The update toast and "New session" flush through here before the editor
  // goes away. Report "not safe" if the latest edit didn't reach the server.
  useEffect(
    () =>
      registerPendingSaveFlush(async () => {
        clearTimeout(extractTimer.current);
        const [saved] = await Promise.all([waitUntilSaved(), extract()]);
        return saved && connectionRef.current !== 'degraded' && connectionRef.current !== 'failed';
      }),
    [extract, waitUntilSaved],
  );

  useEffect(
    () => () => {
      // Leaving the note: rebuild the copies one last time.
      if (extractTimer.current) {
        clearTimeout(extractTimer.current);
        void extract();
      }
    },
    [extract],
  );

  if (openError) {
    return <p className="p-4 text-sm text-muted-foreground">{openError}</p>;
  }

  return (
    <div className={`nugnotes-editor relative flex min-h-0 flex-col ${className ?? ''}`}>
      <div className="min-h-0 flex-1 overflow-auto">
        <BlockNoteView
          editor={editor}
          theme={DARK_THEMES.has(theme) ? 'dark' : 'light'}
          formattingToolbar={false}
          onChange={scheduleExtract}
        >
          <NotesFormattingToolbar />
        </BlockNoteView>
      </div>
      <div
        className={`pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-[var(--glass-border)] glass-heavy px-3 py-1 text-xs text-foreground shadow-sm transition-opacity duration-200 ${
          unsynced || isSaving ? 'opacity-100' : 'opacity-0'
        }`}
        aria-live="polite"
      >
        {connection === 'failed'
          ? "Not saved — these notes can't sync right now"
          : unsynced
            ? 'Not saved — reconnecting…'
            : 'Saving…'}
      </div>
    </div>
  );
});

export default NotesEditor;
