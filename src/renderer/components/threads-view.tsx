import { ConceptThread } from '@/components/concept-thread';
import { ContradictionsPanel } from '@/components/contradictions-panel';
import { CourseQuiz } from '@/components/course-quiz';
import { ThreadList } from '@/components/thread-list';
import { Button } from '@/components/ui/button';
import { WhiskersPanel } from '@/components/whiskers-panel';
import { useCourses } from '@/hooks/use-courses';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { friendlyError } from '@/lib/errors';
import { useMatch, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Cat,
  GitCompareArrows,
  Loader2,
  RotateCcw,
  Sparkles,
  Waypoints,
} from 'lucide-react';
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
  const whiskers = useQuery(api.gaps.listWhiskers, { courseId });
  const contradictions = useQuery(api.gaps.listContradictions, { courseId });
  const readCourse = useMutation(api.concepts.readCourse);
  const [tab, setTab] = useState<Tab>('concepts');
  const themes = useQuery(api.themes.listForCourse, { courseId });
  const [quizScope, setQuizScope] = useState<QuizScope>({});
  const [selected, setSelected] = useState<Id<'concepts'> | null>(null);

  if (data === undefined) {
    return <Loader2 className="m-6 h-5 w-5 animate-spin text-muted-foreground" />;
  }
  if (data === null) {
    return <p className="p-6 text-sm text-muted-foreground">This course isn’t available.</p>;
  }

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
    <ThreadList
      courseId={courseId}
      data={data}
      themes={themes ?? undefined}
      selected={selected}
      onSelect={setSelected}
      onQuizTheme={(id) => {
        setQuizScope({ themeId: id });
        setTab('quiz');
      }}
    />
  );

  const thread = selected ? (
    <ConceptThread
      key={selected}
      conceptId={selected}
      onBack={isMobile ? () => setSelected(null) : undefined}
      onGone={() => setSelected(null)}
      themes={themes?.themes ?? []}
      onOpenConcept={setSelected}
      onQuiz={() => {
        setQuizScope({ conceptId: selected });
        setTab('quiz');
      }}
    />
  ) : (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      Pick a thread to see where it shows up, session by session.
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
          key={quizScope.conceptId ?? quizScope.themeId ?? 'course'}
          courseId={courseId}
          concepts={data.concepts}
          themes={themes?.themes ?? []}
          conceptId={quizScope.conceptId}
          themeId={quizScope.themeId}
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

/** What the Quiz tab opens on: a thread, a theme, or (neither) the whole course. */
interface QuizScope {
  conceptId?: Id<'concepts'>;
  themeId?: Id<'themes'>;
}
