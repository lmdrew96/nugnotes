import { ConceptThread } from '@/components/concept-thread';
import { ContradictionsPanel } from '@/components/contradictions-panel';
import { CourseQuiz } from '@/components/course-quiz';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WhiskersPanel } from '@/components/whiskers-panel';
import { useCourses } from '@/hooks/use-courses';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useMatch, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  Cat,
  GitCompareArrows,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  Waypoints,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { formatDateKey } from '../../../convex/dateKey';

/**
 * Threads: a course's concepts, each one a timeline across its sessions and
 * sources. Pick a course, then a concept.
 */
export function ThreadsView() {
  const match = useMatch({ from: '/threads/$courseId', shouldThrow: false });
  const courseId = match?.params.courseId as Id<'courses'> | undefined;
  return courseId ? <CourseThreads key={courseId} courseId={courseId} /> : <CoursePicker />;
}

function CoursePicker() {
  const navigate = useNavigate();
  const { courses } = useCourses();
  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto p-4">
      <section className="flex flex-col gap-3 rounded-xl glass p-4">
        <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Waypoints className="h-4 w-4 text-primary" />
          Threads
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick a course to see the ideas that run through its sessions and readings.
        </p>
        {courses === undefined ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No courses yet. Shoot a class’s pages from Home to start one.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {courses.map((c) => (
              <Button
                key={c._id}
                variant="secondary"
                className="h-10 gap-1.5 px-4"
                onClick={() => navigate({ to: '/threads/$courseId', params: { courseId: c._id } })}
              >
                <BookOpen className="h-4 w-4" />
                {c.name}
              </Button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CourseThreads({ courseId }: { courseId: Id<'courses'> }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const data = useQuery(api.concepts.listForCourse, { courseId });
  const whiskers = useQuery(api.gaps.listWhiskers, { courseId });
  const contradictions = useQuery(api.gaps.listContradictions, { courseId });
  const readCourse = useMutation(api.concepts.readCourse);
  const [tab, setTab] = useState<Tab>('concepts');
  const [quizConcept, setQuizConcept] = useState<Id<'concepts'> | null>(null);
  const [selected, setSelected] = useState<Id<'concepts'> | null>(null);
  const [filter, setFilter] = useState('');
  const [showDismissed, setShowDismissed] = useState(false);

  if (data === undefined) {
    return <Loader2 className="m-6 h-5 w-5 animate-spin text-muted-foreground" />;
  }
  if (data === null) {
    return <p className="p-6 text-sm text-muted-foreground">This course isn’t available.</p>;
  }

  const q = filter.trim().toLowerCase();
  const matches = (c: { name: string; aliases: string[] }) =>
    !q || [c.name, ...c.aliases].some((n) => n.toLowerCase().includes(q));
  const live = data.concepts.filter((c) => !c.dismissed && matches(c));
  // A thread runs through 2+ sessions; a concept in one is a glossary entry
  // until a second session mentions it.
  const threads = live.filter((c) => c.sessionCount >= 2);
  const glossary = live
    .filter((c) => c.sessionCount === 1)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const dismissed = data.concepts.filter((c) => c.dismissed && matches(c));

  const read = (all: boolean) =>
    void readCourse({ courseId, all }).catch((error: unknown) =>
      toast.error(friendlyError(error, 'Couldn’t start reading. Try again.')),
    );

  const openWhiskers = whiskers?.filter((w) => w.status === 'open').length ?? 0;
  const openContradictions = contradictions?.filter((c) => c.status === 'open').length ?? 0;
  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'concepts', label: 'Threads', icon: <Waypoints className="h-3.5 w-3.5" /> },
    {
      key: 'whiskers',
      label: 'Whiskers',
      icon: <Cat className="h-3.5 w-3.5" />,
      count: openWhiskers,
    },
    {
      key: 'contradictions',
      label: 'Contradictions',
      icon: <GitCompareArrows className="h-3.5 w-3.5" />,
      count: openContradictions,
    },
    { key: 'quiz', label: 'Quiz', icon: <Brain className="h-3.5 w-3.5" /> },
  ];

  const header = (
    <div className="flex flex-col gap-2 px-3 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => navigate({ to: '/threads' })}
          title="All courses"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">All courses</span>
        </Button>
        <h1 className="truncate text-sm font-semibold text-foreground">{data.courseName}</h1>
        <span className="text-xs text-muted-foreground">
          {data.reading > 0 ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Reading {data.reading} session{data.reading === 1 ? '' : 's'}…
            </span>
          ) : (
            `${data.sessionCount} session${data.sessionCount === 1 ? '' : 's'}`
          )}
        </span>
        {data.reading === 0 &&
          (data.unread > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 gap-1.5"
              onClick={() => read(false)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Read {data.unread} session{data.unread === 1 ? '' : 's'}
            </Button>
          ) : (
            data.sessionCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                onClick={() => read(true)}
                title="Read every session again for concepts, whiskers and contradictions"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Read all again
              </Button>
            )
          ))}
      </div>
      <div className="flex gap-1">
        {tabs.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={tab === t.key ? 'default' : 'ghost'}
            className="h-8 gap-1.5 px-3 text-xs"
            onClick={() => setTab(t.key)}
          >
            {t.icon}
            {t.label}
            {!!t.count && (
              <span className="rounded-full bg-background/30 px-1.5 tabular-nums">{t.count}</span>
            )}
          </Button>
        ))}
      </div>
    </div>
  );

  const list = (
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
        <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
          {threads.length} thread{threads.length === 1 ? '' : 's'}
          <span className="font-normal"> · ideas in 2+ sessions</span>
        </p>
        {threads.map((c) => (
          <ConceptRow
            key={c._id}
            name={c.name}
            kind={c.kind}
            sessionCount={c.sessionCount}
            selected={selected === c._id}
            onClick={() => setSelected(c._id)}
          />
        ))}
        {threads.length === 0 && data.reading === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            {q
              ? 'No thread matches that.'
              : live.length === 0
                ? 'Nothing yet. Threads show up after a session’s pages are read.'
                : 'No threads yet: an idea becomes a thread when a second session mentions it.'}
          </p>
        )}
        {glossary.length > 0 && (
          <div className="pt-3">
            <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              Glossary
              <span className="font-normal"> · {glossary.length} in one session, A–Z</span>
            </p>
            {glossary.map((c) => (
              <GlossaryRow
                key={c._id}
                name={c.name}
                where={c.where}
                selected={selected === c._id}
                onClick={() => setSelected(c._id)}
              />
            ))}
          </div>
        )}
        {dismissed.length > 0 && (
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
                  name={c.name}
                  kind={c.kind}
                  sessionCount={c.sessionCount}
                  selected={selected === c._id}
                  muted
                  onClick={() => setSelected(c._id)}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );

  const thread = selected ? (
    <ConceptThread
      key={selected}
      conceptId={selected}
      onBack={isMobile ? () => setSelected(null) : undefined}
      onGone={() => setSelected(null)}
      onQuiz={() => {
        setQuizConcept(selected);
        setTab('quiz');
      }}
    />
  ) : (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      Pick a concept to see where it shows up, session by session.
    </div>
  );

  let body: React.ReactNode;
  if (tab === 'whiskers') {
    body = (
      <div className="h-full overflow-hidden rounded-xl glass">
        {whiskers ? (
          <WhiskersPanel courseName={data.courseName} whiskers={whiskers} />
        ) : (
          <Loader2 className="m-6 h-5 w-5 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  } else if (tab === 'contradictions') {
    body = (
      <div className="h-full overflow-hidden rounded-xl glass">
        {contradictions ? (
          <ContradictionsPanel items={contradictions} />
        ) : (
          <Loader2 className="m-6 h-5 w-5 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  } else if (tab === 'quiz') {
    body = (
      <div className="h-full overflow-hidden rounded-xl glass">
        <CourseQuiz
          key={quizConcept ?? 'course'}
          courseId={courseId}
          concepts={data.concepts}
          conceptId={quizConcept}
        />
      </div>
    );
  } else if (isMobile) {
    body = (
      <div className="h-full overflow-hidden rounded-xl glass p-2">{selected ? thread : list}</div>
    );
  } else {
    body = (
      <div className="flex h-full gap-3">
        <div className="w-72 shrink-0 overflow-hidden rounded-xl glass p-2">{list}</div>
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl glass">{thread}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="min-h-0 flex-1 p-3">{body}</div>
    </div>
  );
}

type Tab = 'concepts' | 'whiskers' | 'contradictions' | 'quiz';

/** A one-session term: tap the name for its entry, or jump straight to its page. */
function GlossaryRow({
  name,
  where,
  selected,
  onClick,
}: {
  name: string;
  where?: { sessionId: Id<'sessions'>; page?: number; classDate?: string; title: string };
  selected: boolean;
  onClick: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-[var(--glass-bg-light)]',
        selected && 'bg-[var(--glass-bg)] ring-1 ring-[var(--glass-border-strong)]',
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm text-foreground"
      >
        {name}
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

function ConceptRow({
  name,
  kind,
  sessionCount,
  selected,
  muted,
  onClick,
}: {
  name: string;
  kind?: string;
  sessionCount: number;
  selected: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
