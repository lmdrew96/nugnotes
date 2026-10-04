import type { Recording } from '@/components/study-view';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { friendlyError } from '@/lib/errors';
import { renderMarkdown } from '@/lib/render-markdown';
import { useAction } from 'convex/react';
import { Cat, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

interface StudyNuggetNotesProps {
  notes: Recording['nuggetNotes'];
  /** Set for the session's owner: lets them ask Nugget for (new) key points. */
  sessionId?: Id<'sessions'>;
}

/** Nugget's key points for a session, generated on request from its notes and documents. */
export function StudyNuggetNotes({ notes, sessionId }: StudyNuggetNotesProps) {
  const generateKeyPoints = useAction(api.nuggetNotes.generateKeyPoints);
  const [isGenerating, setIsGenerating] = useState(false);
  const hasNotes = !!notes && notes.length > 0;

  const generate = async () => {
    if (!sessionId) return;
    setIsGenerating(true);
    try {
      await generateKeyPoints({ sessionId });
    } catch (error) {
      console.error('Generating key points failed:', error);
      toast.error(
        friendlyError(error, "Nugget couldn't pull out key points right now. Please try again."),
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const generateButton = sessionId && (
    <Button
      size="sm"
      variant="secondary"
      className="h-7 gap-1.5 text-xs"
      onClick={() => void generate()}
      disabled={isGenerating}
    >
      {isGenerating ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" />
      )}
      {isGenerating
        ? 'Nugget is reading…'
        : hasNotes
          ? 'Refresh key points'
          : 'Pull out key points'}
    </Button>
  );

  if (!hasNotes) {
    return (
      <ScrollArea className="h-full rounded-xl glass p-4">
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <Cat className="h-8 w-8 text-muted-foreground/50" />
          <div>
            <p className="text-sm text-muted-foreground">No key points yet</p>
            {sessionId && (
              <p className="mt-1 text-xs text-muted-foreground/70">
                Nugget can read your notes and documents and pull out what matters most.
              </p>
            )}
          </div>
          {generateButton}
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full rounded-xl glass p-4">
      {generateButton && <div className="mb-3 flex justify-end">{generateButton}</div>}
      <div className="flex flex-col gap-2">
        {notes.map((note, index) => (
          <div
            // Key points have no id; their order is stable for a saved session.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={index}
            className="rounded-lg glass-light px-3 py-2.5 text-sm text-foreground leading-snug"
          >
            {renderMarkdown(note.text)}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
