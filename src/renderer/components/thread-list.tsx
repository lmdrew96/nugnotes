import {
  DismissedThemes,
  ThemeCard,
  ThemeHeader,
  type ThemeList,
  ThemeName,
} from '@/components/theme-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { ArrowRight, Loader2, Search, Shapes } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { formatDateKey } from '../../../convex/dateKey';

type ConceptList = NonNullable<FunctionReturnType<typeof api.concepts.listForCourse>>;
type Concept = ConceptList['concepts'][number];

/** Not a theme: the threads no theme has been found for yet. */
const UNGROUPED = 'ungrouped';

interface ThreadListProps {
  courseId: Id<'courses'>;
  data: ConceptList;
  themes: ThemeList | undefined;
  selected: Id<'concepts'> | null;
  onSelect: (id: Id<'concepts'>) => void;
  onQuizTheme: (id: Id<'themes'>) => void;
}

/**
 * The left side of Threads: the course's themes, each opening its threads,
 * then the glossary (ideas in one session so far). Searching shows matching
 * threads and glossary terms from every theme.
 */
export function ThreadList({
  courseId,
  data,
  themes,
  selected,
  onSelect,
  onQuizTheme,
}: ThreadListProps) {
  const groupThemes = useMutation(api.themes.group);
  const [filter, setFilter] = useState('');
  const [picked, setOpenTheme] = useState<Id<'themes'> | typeof UNGROUPED | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);

  const q = filter.trim().toLowerCase();
  const matches = (c: { name: string; aliases: string[] }) =>
    !q || [c.name, ...c.aliases].some((n) => n.toLowerCase().includes(q));
  const live = data.concepts.filter((c) => !c.dismissed);
  // A thread runs through 2+ sessions; a concept in one is a glossary entry
  // until a second session mentions it.
  const threads = live.filter((c) => c.sessionCount >= 2);
  const byName = (a: Concept, b: Concept) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const glossary = live.filter((c) => c.sessionCount === 1).sort(byName);
  const dismissed = data.concepts.filter((c) => c.dismissed && matches(c));

  const shownThemes = themes?.themes ?? [];
  const topThemes = shownThemes.filter((t) => !t.parentId);
  const known = new Set(shownThemes.map((t) => t._id));
  const ungrouped = threads.filter((c) => !c.themeId || !known.has(c.themeId));
  const grouping = themes?.status === 'pending';
  // The open theme, unless it was dismissed or regrouped away since.
  const openTheme =
    picked === UNGROUPED || shownThemes.some((t) => t._id === picked) ? picked : null;

  const regroup = () =>
    void groupThemes({ courseId }).catch((error: unknown) =>
      toast.error(friendlyError(error, 'Couldn’t start grouping. Try again.')),
    );

  const row = (c: Concept) => (
    <ConceptRow key={c._id} concept={c} selected={selected === c._id} onClick={onSelect} />
  );

  let body: React.ReactNode;
  if (q) {
    const hitThreads = threads.filter(matches);
    const hitGlossary = glossary.filter(matches);
    body = (
      <>
        {hitThreads.map(row)}
        {hitGlossary.length > 0 && (
          <SectionLabel label="Glossary" detail={`${hitGlossary.length} in one session`} />
        )}
        {hitGlossary.map((c) => (
          <GlossaryRow key={c._id} concept={c} selected={selected === c._id} onClick={onSelect} />
        ))}
        {hitThreads.length + hitGlossary.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">Nothing matches that.</p>
        )}
      </>
    );
  } else if (openTheme) {
    const theme = shownThemes.find((t) => t._id === openTheme);
    const subs = shownThemes.filter((t) => t.parentId === openTheme);
    const inTheme = (id: string) => live.filter((c) => c.themeId === id);
    const direct = openTheme === UNGROUPED ? ungrouped : inTheme(openTheme);
    const oneOffs = [...direct, ...subs.flatMap((s) => inTheme(s._id))]
      .filter((c) => c.sessionCount === 1)
      .sort(byName);
    body = (
      <>
        <ThemeHeader
          theme={theme}
          onBack={() => setOpenTheme(null)}
          onQuiz={theme ? () => onQuizTheme(theme._id) : undefined}
        />
        {direct.filter((c) => c.sessionCount >= 2).map(row)}
        {subs.map((sub) => (
          <div key={sub._id} className="pt-2">
            <ThemeName theme={sub} small />
            <div className="ml-2 border-l border-[var(--glass-border)] pl-1">
              {inTheme(sub._id)
                .filter((c) => c.sessionCount >= 2)
                .map(row)}
            </div>
          </div>
        ))}
        {oneOffs.length > 0 && (
          <div className="pt-3">
            <SectionLabel label="In one session so far" />
            {oneOffs.map((c) => (
              <GlossaryRow
                key={c._id}
                concept={c}
                selected={selected === c._id}
                onClick={onSelect}
              />
            ))}
          </div>
        )}
      </>
    );
  } else {
    body = (
      <>
        <div className="flex items-center gap-2 px-2 pb-1">
          <SectionLabel
            label={`${topThemes.length} theme${topThemes.length === 1 ? '' : 's'}`}
            detail={`${threads.length} thread${threads.length === 1 ? '' : 's'}`}
            inline
          />
          {grouping ? (
            <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Grouping…
            </span>
          ) : (
            live.length > 0 &&
            data.reading === 0 && (
              <Button
                size="sm"
                variant={topThemes.length === 0 ? 'secondary' : 'ghost'}
                className="ml-auto h-6 gap-1 px-2 text-[11px]"
                onClick={regroup}
                title="Group this course’s ideas into themes again"
              >
                <Shapes className="h-3 w-3" />
                {topThemes.length === 0 ? 'Group into themes' : 'Regroup'}
              </Button>
            )
          )}
        </div>
        {themes?.status === 'failed' && (
          <p className="px-2 pb-1 text-[11px] text-destructive">
            Grouping into themes didn’t work. Try Regroup.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          {topThemes.map((t) => (
            <ThemeCard key={t._id} theme={t} onClick={() => setOpenTheme(t._id)} />
          ))}
          {ungrouped.length > 0 && (
            <ThemeCard
              theme={{ name: topThemes.length ? 'Not in a theme yet' : 'All threads' }}
              threadCount={ungrouped.length}
              onClick={() => setOpenTheme(UNGROUPED)}
            />
          )}
        </div>
        {threads.length === 0 && data.reading === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            {live.length === 0
              ? 'Nothing yet. Threads show up after a session’s pages are read.'
              : 'No threads yet: an idea becomes a thread when a second session mentions it.'}
          </p>
        )}
        {glossary.length > 0 && (
          <div className="pt-3">
            <SectionLabel label="Glossary" detail={`${glossary.length} in one session, A–Z`} />
            {glossary.map((c) => (
              <GlossaryRow
                key={c._id}
                concept={c}
                selected={selected === c._id}
                onClick={onSelect}
              />
            ))}
          </div>
        )}
        <DismissedThemes items={themes?.dismissed ?? []} />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      <div className="relative mx-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a thread or term"
          className="h-8 pl-7 text-sm"
          aria-label="Find a thread or glossary term"
        />
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-1 pb-2">
        {body}
        {dismissed.length > 0 && !openTheme && (
          <div className="pt-3">
            <button
              type="button"
              className="px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowDismissed((v) => !v)}
            >
              {showDismissed ? 'Hide' : 'Show'} {dismissed.length} dismissed
            </button>
            {showDismissed &&
              dismissed.map((c) => (
                <ConceptRow
                  key={c._id}
                  concept={c}
                  selected={selected === c._id}
                  muted
                  onClick={onSelect}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({
  label,
  detail,
  inline,
}: {
  label: string;
  detail?: string;
  inline?: boolean;
}) {
  return (
    <p className={cn('text-xs font-medium text-muted-foreground', !inline && 'px-2 pb-1')}>
      {label}
      {detail && <span className="font-normal"> · {detail}</span>}
    </p>
  );
}

function ConceptRow({
  concept,
  selected,
  muted,
  onClick,
}: {
  concept: Concept;
  selected: boolean;
  muted?: boolean;
  onClick: (id: Id<'concepts'>) => void;
}) {
  const { name, kind, sessionCount } = concept;
  return (
    <button
      type="button"
      onClick={() => onClick(concept._id)}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--glass-bg-light)]',
        selected && 'bg-[var(--glass-bg)] ring-1 ring-[var(--glass-border-strong)]',
        muted && 'opacity-60',
      )}
    >
      <span className="min-w-0 flex-1 truncate text-foreground">{name}</span>
      {kind && kind !== 'other' && (
        <span className="shrink-0 text-[10px] text-muted-foreground">{kind}</span>
      )}
      <span
        className="shrink-0 rounded-full bg-secondary px-1.5 text-[10px] tabular-nums text-muted-foreground"
        title={`In ${sessionCount} session${sessionCount === 1 ? '' : 's'}`}
      >
        {sessionCount}
      </span>
    </button>
  );
}

/** A one-session term: tap the name for its entry, or jump straight to its page. */
function GlossaryRow({
  concept,
  selected,
  onClick,
}: {
  concept: Concept;
  selected: boolean;
  onClick: (id: Id<'concepts'>) => void;
}) {
  const navigate = useNavigate();
  const where = concept.where;
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-[var(--glass-bg-light)]',
        selected && 'bg-[var(--glass-bg)] ring-1 ring-[var(--glass-border-strong)]',
      )}
    >
      <button
        type="button"
        onClick={() => onClick(concept._id)}
        className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm text-foreground"
      >
        {concept.name}
      </button>
      {where && (
        <button
          type="button"
          className="flex shrink-0 items-center gap-0.5 text-[11px] text-primary hover:underline"
          title={`Open ${where.title}${where.page !== undefined ? `, page ${where.page + 1}` : ''}`}
          onClick={() =>
            navigate({
              to: '/study/$sessionId',
              params: { sessionId: where.sessionId },
              search: where.page !== undefined ? { page: where.page } : {},
            })
          }
        >
          {where.classDate ? formatDateKey(where.classDate) : 'Open'}
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
