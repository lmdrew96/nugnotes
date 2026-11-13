import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useMutation } from 'convex/react';
import { AlertCircle, Loader2, ScanText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { type TranscriptLine, parseLine } from '../../../convex/transcriptText';

export type TranscriptStatus = 'pending' | 'done' | 'failed' | undefined;

interface PageReadingProps {
  pageId: Id<'pages'>;
  status: TranscriptStatus;
  lines?: TranscriptLine[];
}

/**
 * Where Nugget is with reading a page, and the way to fix a bad read: read it
 * again. The transcript itself is a hidden index and is never shown here.
 */
export function PageReading({ pageId, status, lines }: PageReadingProps) {
  const readPage = useMutation(api.pages.readPage);
  const [confirming, setConfirming] = useState(false);
  // Lines fixed by hand before v0.19.0; reading again would replace them.
  const fixes = lines?.filter((line) => line.original !== undefined).length ?? 0;

  const read = () =>
    void readPage({ pageId, again: status === 'done' }).catch((error: unknown) =>
      toast.error(friendlyError(error, 'Couldn’t start reading the page. Try again.')),
    );

  if (status === 'pending') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Nugget is reading this page…
      </span>
    );
  }

  return (
    <>
      {status === 'failed' && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          Nugget couldn’t read this page.
        </span>
      )}
      <Button
        size="sm"
        variant="secondary"
        className="gap-1.5"
        onClick={() => (status === 'done' && fixes > 0 ? setConfirming(true) : read())}
        title={
          status === 'done'
            ? 'Have Nugget read this page again, e.g. if it links the wrong things'
            : undefined
        }
      >
        <ScanText className="h-4 w-4" />
        {status === 'done' ? 'Read again' : status === 'failed' ? 'Try again' : 'Read this page'}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Read this page again?</AlertDialogTitle>
            <AlertDialogDescription>
              You fixed {fixes === 1 ? '1 line' : `${fixes} lines`} of Nugget’s reading of this page
              by hand. Reading it again replaces them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my fixes</AlertDialogCancel>
            <AlertDialogAction onClick={read}>Read again</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * One transcript line with the page's structure shown: titles and headings,
 * layout marks ([column 2], [box], [diagram: …]) and margin notes. Indentation
 * is kept as the student wrote it.
 */
export function TranscriptLineView({ text }: { text: string }) {
  const { kind, indent, body } = parseLine(text);
  const pad = indent > 0 ? { paddingLeft: `${indent}ch` } : undefined;
  if (kind === 'layout') {
    return (
      <span style={pad} className="block">
        <span className="rounded-full bg-secondary px-2 py-0.5 font-sans text-xs text-muted-foreground">
          {body}
        </span>
      </span>
    );
  }
  if (kind === 'margin') {
    return (
      <span style={pad} className="block italic text-muted-foreground">
        <span className="mr-1.5 rounded bg-secondary px-1 font-sans text-[10px] not-italic uppercase tracking-wide">
          margin
        </span>
        <InlineMarks text={body} />
      </span>
    );
  }
  return (
    <span
      style={pad}
      className={cn(
        'block',
        kind === 'title' && 'font-sans text-base font-bold text-foreground',
        kind === 'heading' && 'font-sans font-semibold text-foreground',
      )}
    >
      <InlineMarks text={body} />
    </span>
  );
}

/**
 * The words of a transcript line. Not markdown: the transcript is the student's
 * own page, so only the two marks the transcription prompt defines are rendered:
 * ~~crossed out~~ and [?] for an unreadable word.
 */
function InlineMarks({ text }: { text: string }) {
  const parts = text.split(/(~~.+?~~|\[\?\])/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        const key = `${i}-${part}`;
        if (part === '[?]') {
          return (
            <span
              key={key}
              className="rounded bg-accent/25 px-0.5 font-semibold text-foreground ring-1 ring-accent"
              title="Nugget couldn’t read this word"
            >
              [?]
            </span>
          );
        }
        if (part.startsWith('~~') && part.endsWith('~~')) {
          return (
            <s key={key} className="text-muted-foreground" title="Crossed out on the page">
              {part.slice(2, -2)}
            </s>
          );
        }
        return <span key={key}>{part}</span>;
      })}
    </>
  );
}
