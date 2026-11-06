import { LineLink } from '@/components/line-link';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Check, EyeOff, HelpCircle, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

export type Contradiction = NonNullable<
  FunctionReturnType<typeof api.gaps.listContradictions>
>[number];

type Filter = 'open' | 'ask' | 'settled';
const settled = (status: string) => status === 'a' || status === 'b' || status === 'dismissed';

/**
 * Two lines from different sessions or sources that disagree, side by side.
 * The student picks the right one or saves it for the professor; neither page
 * is ever edited.
 */
export function ContradictionsPanel({ items }: { items: Contradiction[] }) {
  const [filter, setFilter] = useState<Filter>('open');
  const counts = {
    open: items.filter((c) => c.status === 'open').length,
    ask: items.filter((c) => c.status === 'ask').length,
    settled: items.filter((c) => settled(c.status)).length,
  };
  const shown = items.filter((c) =>
    filter === 'settled' ? settled(c.status) : c.status === filter,
  );
  const labels: Record<Filter, string> = {
    open: 'Open',
    ask: 'Ask the professor',
    settled: 'Settled',
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--glass-border)] p-3">
        {(['open', 'ask', 'settled'] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'secondary' : 'ghost'}
            className="h-7 px-2.5 text-xs"
            onClick={() => setFilter(f)}
          >
            {labels[f]} ({counts[f]})
          </Button>
        ))}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          {shown.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">
              {filter === 'open'
                ? 'Nothing in your notes disagrees right now.'
                : filter === 'ask'
                  ? 'Nothing saved for the professor.'
                  : 'Nothing settled yet.'}
            </p>
          )}
          {shown.map((c) => (
            <ContradictionCard key={c._id} item={c} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function ContradictionCard({ item }: { item: Contradiction }) {
  const resolve = useMutation(api.gaps.resolveContradiction);
  const set = (status: 'open' | 'a' | 'b' | 'ask' | 'dismissed') =>
    void resolve({ contradictionId: item._id as Id<'contradictions'>, status }).catch(
      (error: unknown) => toast.error(friendlyError(error, 'Couldn’t change that. Try again.')),
    );

  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-xl glass p-3',
        item.status === 'dismissed' && 'opacity-60',
      )}
    >
      <h3 className="text-sm font-semibold text-foreground">{item.about}</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {[item.left, item.right].map((side) => {
          const picked = item.status === side.key;
          return (
            <div
              key={side.key}
              className={cn(
                'flex flex-col gap-2 rounded-lg border border-[var(--glass-border)] p-2',
                picked && 'border-primary bg-primary/10',
              )}
            >
              <LineLink line={side} />
              {picked ? (
                <p className="flex items-center gap-1 text-xs font-medium text-primary">
                  <Check className="h-3.5 w-3.5" />
                  You picked this one
                </p>
              ) : (
                item.status !== 'dismissed' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 self-start gap-1.5 px-2 text-xs"
                    onClick={() => set(side.key)}
                  >
                    <Check className="h-3.5 w-3.5" />
                    This one’s right
                  </Button>
                )
              )}
            </div>
          );
        })}
      </div>
      <footer className="flex flex-wrap gap-1">
        {item.status === 'open' ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => set('ask')}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Ask the professor
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => set('dismissed')}
              title="They don't really disagree"
            >
              <EyeOff className="h-3.5 w-3.5" />
              Not a contradiction
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => set('open')}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Reopen
          </Button>
        )}
      </footer>
    </article>
  );
}
