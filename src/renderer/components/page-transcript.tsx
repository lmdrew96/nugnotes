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
import { Input } from '@/components/ui/input';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useMutation } from 'convex/react';
import { AlertCircle, Loader2, RotateCcw, ScanText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { type TranscriptLine, parseLine } from '../../../convex/transcriptText';

export type TranscriptStatus = 'pending' | 'done' | 'failed' | undefined;

interface PageTranscriptProps {
  pageId: Id<'pages'>;
  status: TranscriptStatus;
  lines?: TranscriptLine[];
}

/**
 * The page's faithful transcript, beside its photo. Tap a line to fix it by
 * hand; Claude's version is kept and the fix can be undone.
 */
export function PageTranscript({ pageId, status, lines }: PageTranscriptProps) {
  const readPage = useMutation(api.pages.readPage);
  const [editing, setEditing] = useState<number | null>(null);

  if (status === 'pending') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Nugget is reading this page…
      </p>
    );
  }

  if (status !== 'done' || !lines) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {status === 'failed' ? (
            <>
              <AlertCircle className="h-4 w-4 text-destructive" />
              Nugget couldn’t read this page.
            </>
          ) : (
            'This page hasn’t been read yet.'
          )}
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5"
          onClick={() =>
            void readPage({ pageId }).catch((error: unknown) =>
              toast.error(friendlyError(error, 'Couldn’t start reading the page. Try again.')),
            )
          }
        >
          <ScanText className="h-4 w-4" />
          {status === 'failed' ? 'Try again' : 'Read this page'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 font-mono text-sm leading-relaxed">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="font-sans text-xs text-muted-foreground">
          Tap a line to fix it. [?] marks a word Nugget couldn’t read.
        </p>
        <ReadAgainButton
          pageId={pageId}
          fixes={lines.filter((line) => line.original !== undefined).length}
        />
      </div>
      {lines.map((line, index) =>
        editing === index ? (
          <LineEditor
            // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional; the index is the line's identity
            key={index}
            pageId={pageId}
            index={index}
            line={line}
            onDone={() => setEditing(null)}
          />
        ) : (
          <LineView
            // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional; the index is the line's identity
            key={index}
            pageId={pageId}
            index={index}
            line={line}
            onEdit={() => setEditing(index)}
          />
        ),
      )}
    </div>
  );
}

function LineView({
  pageId,
  index,
  line,
  onEdit,
}: {
  pageId: Id<'pages'>;
  index: number;
  line: TranscriptLine;
  onEdit: () => void;
}) {
  const fixLine = useMutation(api.pages.fixLine);
  const original = line.original;
  return (
    <div className="group flex items-start gap-2">
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          'min-h-7 flex-1 whitespace-pre-wrap rounded px-1.5 text-left hover:bg-secondary',
          original !== undefined && 'bg-primary/10',
        )}
        title={original !== undefined ? `Nugget read: ${original}` : 'Fix this line'}
      >
        <TranscriptLineView text={line.text} />
      </button>
      {original !== undefined && (
        <button
          type="button"
          className="mt-1 flex shrink-0 items-center gap-1 font-sans text-xs text-muted-foreground hover:text-foreground"
          onClick={() =>
            void fixLine({ pageId, index, text: original }).catch((error: unknown) =>
              toast.error(friendlyError(error, 'Couldn’t undo that fix. Try again.')),
            )
          }
          title={`Back to what Nugget read: ${original}`}
        >
          <RotateCcw className="h-3 w-3" />
          edited
        </button>
      )}
    </div>
  );
}

function LineEditor({
  pageId,
  index,
  line,
  onDone,
}: {
  pageId: Id<'pages'>;
  index: number;
  line: TranscriptLine;
  onDone: () => void;
}) {
  const fixLine = useMutation(api.pages.fixLine);
  const [draft, setDraft] = useState(line.text);

  const save = async () => {
    if (draft.trim() && draft !== line.text) {
      try {
        await fixLine({ pageId, index, text: draft });
      } catch (error) {
        toast.error(friendlyError(error, 'Couldn’t save that fix. Try again.'));
      }
    }
    onDone();
  };

  return (
    <Input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void save()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(line.text);
          onDone();
        }
      }}
      aria-label={`Fix line ${index + 1}`}
      className="h-8 font-mono"
    />
  );
}

/**
 * Read an already-read page again, e.g. to pick up better transcription. If the
 * student has fixed lines by hand, confirm first: reading again replaces them.
 */
function ReadAgainButton({ pageId, fixes }: { pageId: Id<'pages'>; fixes: number }) {
  const readPage = useMutation(api.pages.readPage);
  const [confirming, setConfirming] = useState(false);

  const read = () =>
    void readPage({ pageId, again: true }).catch((error: unknown) =>
      toast.error(friendlyError(error, 'Couldn’t start reading the page. Try again.')),
    );

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 shrink-0 gap-1 px-2 font-sans text-xs"
        onClick={() => (fixes > 0 ? setConfirming(true) : read())}
        title="Have Nugget read this page again"
      >
        <ScanText className="h-3.5 w-3.5" />
        Read again
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Read this page again?</AlertDialogTitle>
            <AlertDialogDescription>
              You fixed {fixes === 1 ? '1 line' : `${fixes} lines`} on this page by hand. Reading it
              again replaces the whole transcript, fixes included.
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
