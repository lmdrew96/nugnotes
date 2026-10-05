import type { NotesEditorHandle, NotesSnapshot } from '@/components/notes-editor';
import { Button } from '@/components/ui/button';
import { useSession, useSessionMutations } from '@/hooks/use-sessions';
import { friendlyError } from '@/lib/errors';
import { useAction } from 'convex/react';
import { Loader2, PenLine, Sparkles } from 'lucide-react';
import { Suspense, lazy, useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { sessionDocKey } from '../../../convex/ydocKeys';

// The editor is a big chunk; load it only when a note actually opens.
const NotesEditor = lazy(() => import('@/components/notes-editor'));

interface NotesPanelProps {
  sessionId?: Id<'sessions'> | null;
  /**
   * Creates the session when there isn't one yet (a fresh home page). The
   * editor can only open once its session exists, so a fresh page shows a
   * start button that calls this.
   */
  ensureSession?: () => Promise<Id<'sessions'>>;
}

/** A session's notes: the editor plus "generate notes from my document". */
export function NotesPanel({ sessionId, ensureSession }: NotesPanelProps) {
  const session = useSession(sessionId ?? null);
  const { updateSession } = useSessionMutations();
  const generateNotesAction = useAction(api.ai.generateNotes);
  const editorRef = useRef<NotesEditorHandle>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const saveSnapshot = useCallback(
    async ({ plainText, markdown }: NotesSnapshot) => {
      if (!sessionId) return;
      await updateSession({ id: sessionId, notesPlainText: plainText, notesMarkdown: markdown });
    },
    [sessionId, updateSession],
  );

  const startWriting = async () => {
    if (!ensureSession) return;
    setIsStarting(true);
    try {
      await ensureSession(); // the parent passes the new id down, which opens the editor
    } catch {
      // ensureSession already told the student what went wrong.
    } finally {
      setIsStarting(false);
    }
  };

  const handleGenerateNotes = async () => {
    if (!sessionId) return;
    setIsGenerating(true);
    try {
      // Save the latest typing first, so Nugget complements it rather than repeating it.
      await editorRef.current?.flush();
      const { notes } = await generateNotesAction({ sessionId });
      if (!notes.trim()) {
        toast.error("Nugget didn't come up with anything this time. Please try again.");
        return;
      }
      await editorRef.current?.insertMarkdown(notes);
    } catch (error) {
      console.error('Generating notes failed:', error);
      toast.error(
        friendlyError(error, "Nugget couldn't generate notes right now. Please try again."),
      );
    } finally {
      setIsGenerating(false);
    }
  };

  if (!sessionId) {
    return (
      <div className="flex h-full flex-col p-4">
        <button
          type="button"
          onClick={() => void startWriting()}
          disabled={!ensureSession || isStarting}
          className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl glass text-muted-foreground transition-colors hover:text-foreground disabled:cursor-wait"
        >
          {isStarting ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <PenLine className="h-6 w-6" />
          )}
          <span className="text-sm font-medium">
            {isStarting ? 'Opening your notes…' : 'Click to start writing'}
          </span>
          <span className="text-xs text-muted-foreground/70">
            or upload a document and let Nugget draft them
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-4">
      {session?.documentText && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void handleGenerateNotes()}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {isGenerating ? 'Nugget is writing…' : 'Generate notes from your document'}
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl glass">
        {session === undefined ? (
          <p className="p-4 text-sm text-muted-foreground">Loading the editor…</p>
        ) : (
          <Suspense
            fallback={<p className="p-4 text-sm text-muted-foreground">Loading the editor…</p>}
          >
            <NotesEditor
              key={sessionId}
              ref={editorRef}
              docKey={sessionDocKey(sessionId)}
              onSnapshot={saveSnapshot}
              initialMarkdown={session?.notesMarkdown}
              className="flex-1"
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
