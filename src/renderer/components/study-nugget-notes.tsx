import type { Recording } from '@/components/study-view';
import { ScrollArea } from '@/components/ui/scroll-area';
import { renderMarkdown } from '@/lib/render-markdown';
import { Cat } from 'lucide-react';

interface StudyNuggetNotesProps {
  notes: Recording['nuggetNotes'];
}

/** Nugget's saved notes for a session. */
export function StudyNuggetNotes({ notes }: StudyNuggetNotesProps) {
  if (!notes || notes.length === 0) {
    return (
      <ScrollArea className="h-full rounded-xl glass p-4">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Cat className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No Nugget notes for this session</p>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full rounded-xl glass p-4">
      <div className="flex flex-col gap-2">
        {notes.map((note, index) => (
          <div
            // Notes have no id; their order is stable for a saved session.
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
