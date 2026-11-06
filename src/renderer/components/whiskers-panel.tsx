import { LineLink } from '@/components/line-link';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { friendlyError } from '@/lib/errors';
import { renderMarkdown } from '@/lib/render-markdown';
import { cn } from '@/lib/utils';
import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Check, ClipboardCopy, EyeOff, MessageSquareText, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

export type Whisker = NonNullable<FunctionReturnType<typeof api.gaps.listWhiskers>>[number];

const KIND_LABEL: Record<string, string> = {
  undefined: 'never defined',
  'follow-up': 'never followed up',
  question: 'unanswered question',
};

type Filter = 'open' | 'answered' | 'dismissed';

/**
 * A course's whiskers: what the notes point at but never fill in. Open ones
 * double as an office-hours / pre-exam list (Copy list).
 */
export function WhiskersPanel({
  courseName,
  whiskers,
}: {
  courseName: string;
  whiskers: Whisker[];
}) {
  const [filter, setFilter] = useState<Filter>('open');
  const shown = whiskers.filter((w) => w.status === filter);
  const open = whiskers.filter((w) => w.status === 'open');

  const copyList = async () => {
    const text = [
      `${courseName}: things to ask or look up`,
      '',
      ...open.map(
        (w) =>
          `- ${w.label} (${KIND_LABEL[w.kind] ?? w.kind}; ${[w.lines[0]?.date, w.lines[0]?.title].filter(Boolean).join(', ')})`,
      ),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied. Paste it into your notes or an email.');
    } catch (error) {
      toast.error(friendlyError(error, 'Couldn’t copy the list.'));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--glass-border)] p-3">
        {(['open', 'answered', 'dismissed'] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'secondary' : 'ghost'}
            className="h-7 px-2.5 text-xs capitalize"
            onClick={() => setFilter(f)}
          >
            {f} ({whiskers.filter((w) => w.status === f).length})
          </Button>
        ))}
        {open.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 gap-1.5 px-2.5 text-xs"
            onClick={() => void copyList()}
            title="Copy the open whiskers as a list for office hours or exam prep"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            Copy list
          </Button>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          {shown.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">
              {filter === 'open'
                ? 'No open whiskers. Nothing your notes point at is left hanging (yet).'
                : `No ${filter} whiskers.`}
            </p>
          )}
          {shown.map((w) => (
            <WhiskerCard key={w._id} whisker={w} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function WhiskerCard({ whisker }: { whisker: Whisker }) {
  const answer = useMutation(api.gaps.answerWhisker);
  const setStatus = useMutation(api.gaps.setWhiskerStatus);
  const [answering, setAnswering] = useState(false);
  const [note, setNote] = useState('');

  const run = (promise: Promise<unknown>, fallback: string) =>
    void promise.catch((error: unknown) => toast.error(friendlyError(error, fallback)));

  const change = (status: 'open' | 'dismissed') =>
    run(
      setStatus({ whiskerId: whisker._id as Id<'whiskers'>, status }),
      'Couldn’t change that. Try again.',
    );

  const saveNote = async () => {
    try {
      await answer({ whiskerId: whisker._id as Id<'whiskers'>, note });
      setAnswering(false);
      setNote('');
    } catch (error) {
      toast.error(friendlyError(error, 'Couldn’t save your answer. Try again.'));
    }
  };

  return (
    <article
      className={cn(
        'flex flex-col gap-2 rounded-xl glass p-3',
        whisker.status === 'dismissed' && 'opacity-60',
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
          {KIND_LABEL[whisker.kind] ?? whisker.kind}
        </span>
        <h3 className="text-sm font-semibold text-foreground">{whisker.label}</h3>
      </header>

      <div className="flex flex-col gap-2">
        {whisker.lines.map((line) => (
          <LineLink key={`${line.sessionId}-${line.page}-${line.text}`} line={line} />
        ))}
      </div>

      {whisker.status === 'answered' && (
        <div className="flex flex-col gap-2 rounded-lg bg-primary/10 p-2">
          <p className="flex items-center gap-1 text-xs font-medium text-primary">
            <Check className="h-3.5 w-3.5" />
            Answered
          </p>
          {whisker.answerLines.map((line) => (
            <LineLink key={`${line.sessionId}-${line.page}-${line.text}`} line={line} />
          ))}
          {whisker.answerNote && (
            <div className="text-sm text-foreground/90">{renderMarkdown(whisker.answerNote)}</div>
          )}
        </div>
      )}

      {answering && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveNote();
          }}
        >
          <textarea
            // Focus when the box opens (the student just tapped Answer it).
            ref={(el) => el?.focus()}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What you found out (e.g. asked in office hours: …)"
            className="w-full rounded-lg border border-[var(--glass-border)] bg-background/60 p-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Your answer"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="h-8" disabled={!note.trim()}>
              Save answer
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => setAnswering(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {!answering && (
        <footer className="flex flex-wrap gap-1">
          {whisker.status === 'open' ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => setAnswering(true)}
              >
                <MessageSquareText className="h-3.5 w-3.5" />
                Answer it
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => change('dismissed')}
              >
                <EyeOff className="h-3.5 w-3.5" />
                Dismiss
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => change('open')}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Reopen
            </Button>
          )}
        </footer>
      )}
    </article>
  );
}
