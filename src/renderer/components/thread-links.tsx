import { Button } from '@/components/ui/button';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { ArrowRight, EyeOff, Sparkles, Undo2, Waypoints } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

type ThemeRef = { _id: Id<'themes'>; name: string; parentId?: Id<'themes'> };

/** A date that opens the page it cites. */
function CiteLink({
  sessionId,
  date,
  page,
  label,
}: {
  sessionId: Id<'sessions'>;
  date: string;
  page?: number;
  label?: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-primary hover:underline"
      onClick={() =>
        navigate({
          to: '/study/$sessionId',
          params: { sessionId },
          search: page !== undefined ? { page } : {},
        })
      }
    >
      {date}
      {label && <span className="text-muted-foreground">· {label}</span>}
      <ArrowRight className="h-3 w-3" />
    </button>
  );
}

/**
 * Nugget's arc for a thread: one line on how the idea moved across the course,
 * with the sessions it cites. Styled as Nugget's layer, apart from the pages.
 */
export function ThreadArc({
  arc,
}: {
  arc?: { text: string; cites: { sessionId: Id<'sessions'>; date: string; page?: number }[] };
}) {
  if (!arc) return null;
  return (
    <section className="rounded-lg border border-dashed border-accent/60 bg-accent/10 p-3">
      <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        Arc · Nugget’s reading
      </p>
      <p className="text-sm text-foreground">{arc.text}</p>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {arc.cites.map((c) => (
          <CiteLink key={`${c.sessionId}-${c.page}`} {...c} />
        ))}
      </div>
    </section>
  );
}

/**
 * What a thread connects to: each other idea, how (from the notes), and the
 * pages that show it. Links across themes are marked; wrong ones can be dismissed.
 */
export function ThreadConnections({
  conceptId,
  themeId,
  themes,
  onOpenConcept,
}: {
  conceptId: Id<'concepts'>;
  themeId?: Id<'themes'>;
  themes: ThemeRef[];
  onOpenConcept?: (id: Id<'concepts'>) => void;
}) {
  const edges = useQuery(api.edges.forConcept, { conceptId });
  const setDismissed = useMutation(api.edges.setDismissed);
  const [showDismissed, setShowDismissed] = useState(false);
  if (!edges || edges.length === 0) return null;

  const topOf = (id?: Id<'themes'>) =>
    id ? (themes.find((t) => t._id === id)?.parentId ?? id) : undefined;
  const nameOf = (id?: Id<'themes'>) => themes.find((t) => t._id === id)?.name;
  const mine = topOf(themeId);
  const live = edges.filter((e) => !e.dismissed);
  const dismissed = edges.filter((e) => e.dismissed);

  const toggle = (edgeId: Id<'conceptEdges'>, value: boolean) =>
    void setDismissed({ edgeId, dismissed: value }).catch((error: unknown) =>
      toast.error(friendlyError(error, 'Couldn’t change that. Try again.')),
    );

  const row = (edge: (typeof edges)[number]) => {
    const theirs = topOf(edge.other.themeId);
    const crossTheme = !!mine && !!theirs && mine !== theirs;
    return (
      <li
        key={edge._id}
        className={cn(
          'rounded-lg px-2 py-1.5',
          crossTheme && 'bg-primary/10 ring-1 ring-primary/40',
          edge.dismissed && 'opacity-60',
        )}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              className="text-left text-sm font-medium text-foreground hover:underline disabled:no-underline"
              onClick={() => onOpenConcept?.(edge.other._id)}
              disabled={!onOpenConcept}
            >
              {edge.other.name}
            </button>
            {crossTheme && (
              <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 text-[10px] text-foreground">
                {nameOf(theirs) ?? 'other theme'}
              </span>
            )}
            <p className="text-xs text-muted-foreground">{edge.how}</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0"
            onClick={() => toggle(edge._id, !edge.dismissed)}
            title={edge.dismissed ? 'Bring this connection back' : 'This connection is wrong'}
          >
            {edge.dismissed ? (
              <Undo2 className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        <div className="mt-1 flex flex-col gap-1">
          {edge.cites.map((c, i) => (
            <div key={`${c.sessionId}-${c.page}-${i}`} className="flex flex-col gap-0.5">
              <CiteLink sessionId={c.sessionId} date={c.date} page={c.page} label={c.label} />
              {c.quote && (
                <p className="border-l-2 border-[var(--glass-border)] pl-2 text-xs text-muted-foreground">
                  {c.quote}
                </p>
              )}
            </div>
          ))}
        </div>
      </li>
    );
  };

  return (
    <section>
      <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Waypoints className="h-3.5 w-3.5" />
        Connects to
      </p>
      <ul className="flex flex-col gap-1">{live.map(row)}</ul>
      {dismissed.length > 0 && (
        <>
          <button
            type="button"
            className="mt-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setShowDismissed((v) => !v)}
          >
            {showDismissed ? 'Hide' : 'Show'} {dismissed.length} dismissed
          </button>
          {showDismissed && <ul className="mt-1 flex flex-col gap-1">{dismissed.map(row)}</ul>}
        </>
      )}
    </section>
  );
}
