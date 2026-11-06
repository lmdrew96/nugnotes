import { TranscriptLineView } from '@/components/page-transcript';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { ArrowLeft, ArrowRight, Brain, EyeOff, Loader2, Scissors, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { formatDateKey } from '../../../convex/dateKey';

interface ConceptThreadProps {
  conceptId: Id<'concepts'>;
  /** Mobile: back to the concept list. */
  onBack?: () => void;
  /** The concept no longer exists (e.g. every line was split off). */
  onGone: () => void;
  /** Start a quiz on this concept. */
  onQuiz?: () => void;
}

/**
 * One concept as a timeline: each session or source that mentions it, oldest
 * first, with the student's own lines and a link to the page. Dismiss a wrong
 * concept, or split lines that were merged in by mistake into their own.
 */
export function ConceptThread({ conceptId, onBack, onGone, onQuiz }: ConceptThreadProps) {
  const navigate = useNavigate();
  const thread = useQuery(api.concepts.thread, { conceptId });
  const setDismissed = useMutation(api.concepts.setDismissed);
  const split = useMutation(api.concepts.split);
  const [splitting, setSplitting] = useState(false);
  const [picked, setPicked] = useState<Set<Id<'conceptMentions'>>>(new Set());
  const [newName, setNewName] = useState('');

  if (thread === undefined) {
    return <Loader2 className="m-6 h-5 w-5 animate-spin text-muted-foreground" />;
  }
  if (thread === null) {
    return (
      <div className="flex flex-col items-start gap-2 p-6 text-sm text-muted-foreground">
        This concept is gone.
        <Button size="sm" variant="secondary" onClick={onGone}>
          Back to the list
        </Button>
      </div>
    );
  }

  const togglePick = (id: Id<'conceptMentions'>) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const doSplit = async () => {
    try {
      await split({ conceptId, mentionIds: [...picked], name: newName });
      toast.success(`Split off “${newName.trim()}”.`);
      setSplitting(false);
      setPicked(new Set());
      setNewName('');
    } catch (error) {
      toast.error(friendlyError(error, 'Couldn’t split those lines off. Try again.'));
    }
  };

  const toggleDismissed = () =>
    void setDismissed({ conceptId, dismissed: !thread.dismissed }).catch((error: unknown) =>
      toast.error(friendlyError(error, 'Couldn’t change that. Try again.')),
    );

  const sessionCount = thread.timeline.length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-2 border-b border-[var(--glass-border)] p-4">
        <div className="flex items-start gap-2">
          {onBack && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back to concepts</span>
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-foreground">{thread.name}</h2>
            <p className="text-xs text-muted-foreground">
              {thread.kind && thread.kind !== 'other' && <span>{thread.kind} · </span>}
              in {sessionCount} session{sessionCount === 1 ? '' : 's'}
              {thread.aliases.length > 0 && <span> · also: {thread.aliases.join(', ')}</span>}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            {onQuiz && !thread.dismissed && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 px-2 text-xs"
                onClick={onQuiz}
                title="Quiz me on this concept"
              >
                <Brain className="h-3.5 w-3.5" />
                Quiz me
              </Button>
            )}
            <Button
              size="sm"
              variant={splitting ? 'secondary' : 'ghost'}
              className="h-8 gap-1.5 px-2 text-xs"
              onClick={() => {
                setSplitting((v) => !v);
                setPicked(new Set());
              }}
              title="Some of these lines are about something else"
            >
              <Scissors className="h-3.5 w-3.5" />
              Split
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 px-2 text-xs"
              onClick={toggleDismissed}
              title={thread.dismissed ? 'Show this concept again' : 'This isn’t a real concept'}
            >
              {thread.dismissed ? (
                <Undo2 className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
              {thread.dismissed ? 'Bring back' : 'Dismiss'}
            </Button>
          </div>
        </div>
        {splitting && (
          <form
            className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/60 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void doSplit();
            }}
          >
            <p className="w-full text-xs text-muted-foreground">
              Tick the lines that are about something else, name it, then split.
            </p>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name for the split-off lines"
              className="h-8 min-w-0 flex-1 text-sm"
              aria-label="Name for the new concept"
            />
            <Button
              type="submit"
              size="sm"
              className="h-8"
              disabled={picked.size === 0 || !newName.trim()}
            >
              Split off {picked.size || ''}
            </Button>
          </form>
        )}
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <ol className="flex flex-col gap-4 p-4">
          {thread.timeline.map((group) => (
            <li key={group.sessionId} className="relative border-l-2 border-primary/40 pl-4">
              <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-primary" />
              <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                {group.classDate ? formatDateKey(group.classDate) : 'Undated'}
                <span className="text-foreground">{group.title}</span>
                {group.isSource && (
                  <span className="rounded-full bg-accent/20 px-1.5 text-[10px] text-foreground">
                    Source
                  </span>
                )}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {group.entries.map((entry) => {
                  const where =
                    entry.pageIndex !== undefined
                      ? { label: `Page ${entry.pageIndex + 1}`, page: entry.pageIndex }
                      : entry.sourcePage !== undefined
                        ? { label: `p. ${entry.sourcePage}`, page: entry.sourcePage }
                        : null;
                  return (
                    <li
                      key={entry.mentionId}
                      className={cn(
                        'flex items-start gap-2 rounded-lg px-2 py-1.5',
                        picked.has(entry.mentionId) && 'bg-primary/10',
                      )}
                    >
                      {splitting && (
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
                          checked={picked.has(entry.mentionId)}
                          onChange={() => togglePick(entry.mentionId)}
                          aria-label="Split this line off"
                        />
                      )}
                      <div className="min-w-0 flex-1 whitespace-pre-wrap font-mono text-sm leading-relaxed">
                        <TranscriptLineView text={entry.text} />
                      </div>
                      {where && (
                        <button
                          type="button"
                          className="mt-0.5 flex shrink-0 items-center gap-0.5 text-xs text-primary hover:underline"
                          onClick={() =>
                            navigate({
                              to: '/study/$sessionId',
                              params: { sessionId: group.sessionId },
                              search: { page: where.page },
                            })
                          }
                        >
                          {where.label}
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      </ScrollArea>
    </div>
  );
}
