import { registerPendingSaveFlush } from '@/lib/pending-save';
import { useAuth } from '@clerk/clerk-react';
import { SuperDocEditor, type SuperDocReadyEvent } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';
import { useMutation } from 'convex/react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from '../../../convex/_generated/api';
import type { DocKey } from '../../../convex/ydocKeys';
import {
  SUPERDOC_FONT_OPTIONS,
  SUPERDOC_TEMPLATE_URL,
  superDocFontsConfig,
} from '../../superdoc/fonts';
import { normalizeSuperDocMarkdown } from '../../superdoc/markdown';

/** Built by scripts/build-superdoc-assets.mjs. */
const COLLAB_WORKER_URL = '/superdoc/collab-worker.js';
/** Quiet time after an edit before the plain-text and markdown copies are rebuilt. */
const EXTRACT_DEBOUNCE_MS = 1000;
/** How long to wait before re-claiming a room another tab is still creating. */
const CLAIM_RETRY_MS = 2000;

type RoomMode = 'create' | 'join';
type Connection = 'connecting' | 'synced' | 'degraded' | 'failed';

/** Built-in toolbar controls NugNotes doesn't use: no AI provider is wired into
 *  SuperDoc, and there's no tracked-changes or ruler-unit workflow. */
const EXCLUDED_TOOLBAR_ITEMS = [
  'ai',
  'document-mode',
  'track-changes-accept-selection',
  'track-changes-reject-selection',
  'measurement-unit',
];

const fontsConfig = superDocFontsConfig();
const uiConfig = {
  toolbar: {
    // Fit the editor column, not the window, so controls that don't fit go
    // into the overflow menu instead of under neighbouring panels.
    responsiveTo: 'container' as const,
    excludeItems: EXCLUDED_TOOLBAR_ITEMS,
    fontOptions: SUPERDOC_FONT_OPTIONS,
  },
};
const viewOptions = { layout: 'web' as const };

/** The slice of SuperDoc's Document API this editor reads. */
type MaybePromise<T> = T | Promise<T>;
type DocApi = {
  blocks: {
    list(input: unknown): MaybePromise<{ blocks: { text?: string; textPreview?: string }[] }>;
  };
  getMarkdown(input: object): MaybePromise<string>;
  insert(input: { value: string; type: 'markdown' }): unknown;
};

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
  /** Append markdown (e.g. Nugget's generated notes) at the end of the note. */
  insertMarkdown(markdown: string): Promise<void>;
}

interface NotesEditorProps {
  docKey: DocKey;
  /** Persist the derived copies; called about a second after edits settle. */
  onSnapshot: (snapshot: NotesSnapshot) => Promise<void> | void;
  className?: string;
}

/**
 * A note edited in SuperDoc (ported from Folio's SuperDocEditor). Its Y.Doc
 * lives in Convex (convex/ydoc.ts), synced by the "convex" provider adapter
 * inside SuperDoc's collaboration worker (src/superdoc/). This component owns
 * what the worker can't:
 *   - claiming the room (create vs join) before SuperDoc mounts,
 *   - rebuilding the plain-text and markdown copies after edits settle,
 *   - telling the student when edits aren't reaching the server.
 * Key it on docKey: SuperDoc reads its document once at mount.
 */
const NotesEditor = forwardRef<NotesEditorHandle, NotesEditorProps>(function NotesEditor(
  { docKey, onSnapshot, className },
  ref,
) {
  const { getToken } = useAuth();
  // SuperDoc rebuilds the editor when `document` changes, so the token
  // resolver it holds must be stable. Clerk's getToken always returns a
  // current token.
  const fetchToken = useCallback(
    async () => (await getToken({ template: 'convex' })) ?? '',
    [getToken],
  );
  const claimRoom = useMutation(api.ydoc.claimRoom);

  // ---- room claim (decided once, before SuperDoc mounts) ----
  const [roomMode, setRoomMode] = useState<RoomMode | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  // Identifies this editor's claim across remounts (StrictMode mounts twice
  // in dev), so re-claiming its own empty room isn't mistaken for another tab.
  const [claimToken] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const claim = async () => {
      try {
        const result = await claimRoom({ docKey, claimToken });
        if (cancelled) return;
        if (result === 'wait') timer = setTimeout(() => void claim(), CLAIM_RETRY_MS);
        else setRoomMode(result);
      } catch (error) {
        console.error("NugNotes: couldn't open the notes editor", error);
        if (!cancelled) setClaimError("These notes couldn't be opened.");
      }
    };
    void claim();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [claimRoom, docKey, claimToken]);

  const document = useMemo(
    () =>
      roomMode === null
        ? null
        : {
            type: 'docx' as const,
            // A room needs a base file. On create it's the NugNotes template
            // (its styles become the note's); on join the Y.Doc replaces it.
            url: SUPERDOC_TEMPLATE_URL,
            collaboration: {
              providerType: 'extension' as const,
              adapterId: 'convex',
              documentId: docKey,
              roomMode,
              providerOptions: { convexUrl: import.meta.env.VITE_CONVEX_URL },
              token: fetchToken,
            },
          },
    [docKey, roomMode, fetchToken],
  );

  // ---- connection state → save pill + unload guard ----
  const [connection, setConnection] = useState<Connection>('connecting');
  const connectionRef = useRef<Connection>('connecting');
  const onConnection = (state: Connection) => {
    console.debug(`NugNotes: notes sync ${connectionRef.current} → ${state}`);
    connectionRef.current = state;
    setConnection(state);
  };
  const unsynced = connection === 'degraded' || connection === 'failed';

  useEffect(() => {
    if (!unsynced) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // some browsers still require this to show the prompt
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsynced]);

  // ---- derived copies (plain text + markdown) ----
  const docRef = useRef<DocApi | null>(null);
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  const extractTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const extracting = useRef<Promise<void> | null>(null);
  const extractAgain = useRef(false);

  const extract = useCallback(async (): Promise<void> => {
    if (extracting.current) {
      extractAgain.current = true; // an edit landed mid-run; go once more after
      return extracting.current;
    }
    const doc = docRef.current;
    if (!doc) return;
    extracting.current = (async () => {
      do {
        extractAgain.current = false;
        try {
          const [{ blocks }, markdown] = await Promise.all([
            Promise.resolve(doc.blocks.list({ includeText: true, limit: 20_000 })),
            Promise.resolve(doc.getMarkdown({})),
          ]);
          // getText would run paragraphs together; join blocks instead.
          const plainText = blocks
            .map((b) => b.text ?? b.textPreview ?? '')
            .join('\n\n')
            .trim();
          await onSnapshotRef.current({ plainText, markdown: normalizeSuperDocMarkdown(markdown) });
        } catch (error) {
          // The Y.Doc (the real content) is unaffected; the copies catch up on
          // the next edit. Logged, not surfaced — nothing the student can do.
          console.error('NugNotes: notes snapshot failed', error);
        }
      } while (extractAgain.current);
    })();
    try {
      await extracting.current;
    } finally {
      extracting.current = null;
    }
  }, []);

  const scheduleExtract = useCallback(() => {
    clearTimeout(extractTimer.current);
    extractTimer.current = setTimeout(() => void extract(), EXTRACT_DEBOUNCE_MS);
  }, [extract]);

  useImperativeHandle(
    ref,
    () => ({
      flush: async () => {
        clearTimeout(extractTimer.current);
        await extract();
      },
      insertMarkdown: async (markdown: string) => {
        const doc = docRef.current;
        if (!doc) throw new Error('The editor is still opening');
        // No target: SuperDoc appends at the end of the document.
        await doc.insert({ value: markdown, type: 'markdown' });
        scheduleExtract();
      },
    }),
    [extract, scheduleExtract],
  );

  // The update toast flushes through here before reloading. Edits live in the
  // worker's Y.Doc; while the connection is down a reload could lose them, so
  // report "not safe".
  useEffect(
    () =>
      registerPendingSaveFlush(async () => {
        clearTimeout(extractTimer.current);
        await extract();
        return connectionRef.current !== 'degraded' && connectionRef.current !== 'failed';
      }),
    [extract],
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

  const onReady = ({ superdoc }: SuperDocReadyEvent) => {
    docRef.current = (superdoc.activeEditor?.doc ?? null) as DocApi | null;
    void extract();
  };

  if (claimError) {
    return <p className="p-4 text-sm text-muted-foreground">{claimError}</p>;
  }
  if (!document) {
    return <p className="p-4 text-sm text-muted-foreground">Opening your notes…</p>;
  }

  return (
    <div className={`nugnotes-superdoc relative flex min-h-0 flex-col ${className ?? ''}`}>
      <SuperDocEditor
        document={document}
        documentMode="editing"
        contained
        ui={uiConfig}
        fonts={fontsConfig}
        viewOptions={viewOptions}
        telemetry={{ enabled: false }}
        workerUrls={{ collaboration: COLLAB_WORKER_URL }}
        onReady={onReady}
        onEditorUpdate={scheduleExtract}
        onCollaborationConnectionChange={({ state }: { state: Connection }) => onConnection(state)}
        onException={(e) => {
          // Spell out the error — the raw payload logs as "[object Error]".
          const { error, ...rest } = e as { error?: unknown } & Record<string, unknown>;
          console.error(
            'NugNotes: SuperDoc exception',
            rest,
            error instanceof Error ? `${error.name}: ${error.message}` : error,
          );
        }}
        className="min-h-0 flex-1"
      />
      <div
        className={`pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-[var(--glass-border)] glass-heavy px-3 py-1 text-xs text-foreground shadow-sm transition-opacity duration-200 ${
          unsynced ? 'opacity-100' : 'opacity-0'
        }`}
        aria-live="polite"
      >
        {connection === 'failed'
          ? "Not saved — these notes can't sync right now"
          : 'Not saved — reconnecting…'}
      </div>
    </div>
  );
});

export default NotesEditor;
