import { ConceptThread } from '@/components/concept-thread';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCourses } from '@/hooks/use-courses';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useMatch, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { ArrowLeft, BookOpen, Loader2, Search, Sparkles, Waypoints } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

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
  const readCourse = useMutation(api.concepts.readCourse);
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
  const dismissed = data.concepts.filter((c) => c.dismissed && matches(c));

  const findConcepts = () =>
    void readCourse({ courseId }).catch((error: unknown) =>
      toast.error(friendlyError(error, 'Couldn’t start reading. Try again.')),
    );

  const list = (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      <div className="flex items-center gap-2 px-1">
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
      </div>

      <p className="px-2 text-xs text-muted-foreground">
        {data.reading > 0 ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Reading {data.reading} session{data.reading === 1 ? '' : 's'}…
          </span>
        ) : (
          `${live.length} concept${live.length === 1 ? '' : 's'} across ${data.sessionCount} session${data.sessionCount === 1 ? '' : 's'}`
        )}
      </p>
      {data.unread > 0 && data.reading === 0 && (
        <Button size="sm" variant="secondary" className="mx-1 gap-1.5" onClick={findConcepts}>
          <Sparkles className="h-3.5 w-3.5" />
          Find concepts in {data.unread} session{data.unread === 1 ? '' : 's'}
        </Button>
      )}

      <div className="relative mx-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a concept"
          className="h-8 pl-7 text-sm"
          aria-label="Find a concept"
        />
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-1 pb-2">
        {live.map((c) => (
          <ConceptRow
            key={c._id}
            name={c.name}
            kind={c.kind}
            sessionCount={c.sessionCount}
            selected={selected === c._id}
            onClick={() => setSelected(c._id)}
          />
        ))}
        {live.length === 0 && data.reading === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {q
              ? 'No concept matches that.'
              : 'No concepts yet. They show up after a session’s pages are read.'}
          </p>
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
    />
  ) : (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      Pick a concept to see where it shows up, session by session.
    </div>
  );

  if (isMobile) {
    return (
      <div className="h-full p-3">
        <div className="h-full overflow-hidden rounded-xl glass p-2">
          {selected ? thread : list}
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full gap-3 p-3">
      <div className="w-72 shrink-0 overflow-hidden rounded-xl glass p-2">{list}</div>
      <div className="min-w-0 flex-1 overflow-hidden rounded-xl glass">{thread}</div>
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
