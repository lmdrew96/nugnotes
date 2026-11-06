import { CatDisplay } from '@/components/cats/cat-display';
import {
  type CatMood,
  DEFAULT_BUDDY_NAME,
  DEFAULT_BUDDY_VARIANT,
  isCatVariant,
} from '@/components/cats/cat-sprites';
import { LineLink } from '@/components/line-link';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useStudySettings } from '@/hooks/use-productivity';
import { useSessionList } from '@/hooks/use-sessions';
import { friendlyError } from '@/lib/errors';
import { renderInline } from '@/lib/render-markdown';
import { cn } from '@/lib/utils';
import { useAction } from 'convex/react';
import { CheckCircle2, Loader2, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { CourseQuiz as Quiz } from '../../../convex/courseQuiz';
import { formatDateKey } from '../../../convex/dateKey';

type ScopeKind = 'course' | 'thread' | 'range';

interface CourseQuizProps {
  courseId: Id<'courses'>;
  concepts: { _id: Id<'concepts'>; name: string; dismissed: boolean }[];
  /** Preselect a thread (from "Quiz me" on a concept). */
  conceptId?: Id<'concepts'> | null;
}

const CHECK_IN: Record<string, (label: string) => string> = {
  undefined: (label) => `Your notes never spell out the ${label}. Do you know it?`,
  question: (label) => `You asked yourself: ${label}. Can you answer it now?`,
  'follow-up': (label) => `Your notes say to follow up on this: ${label}. Have you?`,
};

/**
 * Nugget's quiz for a course: a thread, a range of sessions or everything.
 * Your study buddy (Settings → Appearance) asks; every answer shows the lines
 * it came from.
 */
export function CourseQuiz({ courseId, concepts, conceptId }: CourseQuizProps) {
  const generate = useAction(api.courseQuiz.generate);
  const { settings } = useStudySettings();
  const buddyVariant = isCatVariant(settings?.buddyVariant)
    ? settings.buddyVariant
    : DEFAULT_BUDDY_VARIANT;
  const buddyName = settings?.buddyName || DEFAULT_BUDDY_NAME;

  const sessions = useSessionList();
  const dates = useMemo(
    () =>
      [
        ...new Set(
          sessions
            .filter((s) => s.courseId === courseId && s.classDate)
            .map((s) => s.classDate as string),
        ),
      ].sort(),
    [sessions, courseId],
  );
  const liveConcepts = concepts.filter((c) => !c.dismissed);

  const [kind, setKind] = useState<ScopeKind>(conceptId ? 'thread' : 'course');
  const [threadId, setThreadId] = useState<Id<'concepts'> | ''>(conceptId ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [count, setCount] = useState(10);
  const [withWhiskers, setWithWhiskers] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);

  const start = async () => {
    const rangeFrom = from || dates[0];
    const rangeTo = to || dates[dates.length - 1];
    const scope =
      kind === 'thread' && threadId
        ? { kind: 'thread' as const, conceptId: threadId }
        : kind === 'range' && rangeFrom && rangeTo
          ? {
              kind: 'range' as const,
              from: rangeFrom <= rangeTo ? rangeFrom : rangeTo,
              to: rangeFrom <= rangeTo ? rangeTo : rangeFrom,
            }
          : { kind: 'course' as const };
    setLoading(true);
    setError(null);
    try {
      setQuiz(await generate({ courseId, scope, count, includeWhiskers: withWhiskers }));
    } catch (err) {
      setError(friendlyError(err, 'Couldn’t make a quiz. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (quiz) {
    return (
      <QuizRun
        quiz={quiz}
        buddyName={buddyName}
        buddyVariant={buddyVariant}
        onNew={() => setQuiz(null)}
      />
    );
  }

  const select =
    'h-9 rounded-md border border-[var(--glass-border)] bg-background/60 px-2 text-sm text-foreground';

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-lg flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <CatDisplay mood="studying" variant={buddyVariant} size="small" />
          <p className="text-sm text-foreground">
            {buddyName} will quiz you from your own notes. What should it cover?
          </p>
        </div>

        <div className="flex flex-wrap gap-1">
          {(
            [
              ['course', 'Whole course'],
              ['thread', 'One concept'],
              ['range', 'Some sessions'],
            ] as const
          ).map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={kind === k ? 'secondary' : 'ghost'}
              className="h-8 text-xs"
              onClick={() => setKind(k)}
              disabled={
                (k === 'thread' && liveConcepts.length === 0) ||
                (k === 'range' && dates.length === 0)
              }
            >
              {label}
            </Button>
          ))}
        </div>

        {kind === 'thread' && (
          <select
            className={select}
            value={threadId}
            onChange={(e) => setThreadId(e.target.value as Id<'concepts'>)}
            aria-label="Concept"
          >
            <option value="">Pick a concept…</option>
            {liveConcepts.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {kind === 'range' && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            From
            <select
              className={select}
              value={from || dates[0]}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="First session"
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {formatDateKey(d)}
                </option>
              ))}
            </select>
            to
            <select
              className={select}
              value={to || dates[dates.length - 1]}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Last session"
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {formatDateKey(d)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Questions:</span>
          {[5, 10, 15].map((n) => (
            <Button
              key={n}
              size="sm"
              variant={count === n ? 'secondary' : 'ghost'}
              className="h-7 px-2.5 text-xs"
              onClick={() => setCount(n)}
            >
              {n}
            </Button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--primary)]"
            checked={withWhiskers}
            onChange={(e) => setWithWhiskers(e.target.checked)}
          />
          Add whisker check-ins (things your notes never filled in)
        </label>

        <Button
          className="h-11 gap-2"
          disabled={loading || (kind === 'thread' && !threadId)}
          onClick={() => void start()}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? `${buddyName} is writing your quiz…` : 'Quiz me'}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </ScrollArea>
  );
}

type Step =
  | { type: 'question'; index: number }
  | { type: 'check-in'; index: number }
  | { type: 'results' };

function QuizRun({
  quiz,
  buddyName,
  buddyVariant,
  onNew,
}: {
  quiz: Quiz;
  buddyName: string;
  buddyVariant: Parameters<typeof CatDisplay>[0]['variant'];
  onNew: () => void;
}) {
  const total = quiz.questions.length + quiz.checkIns.length;
  const [position, setPosition] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const [notYet, setNotYet] = useState<string[]>([]);

  const step: Step =
    position < quiz.questions.length
      ? { type: 'question', index: position }
      : position < total
        ? { type: 'check-in', index: position - quiz.questions.length }
        : { type: 'results' };

  const next = () => {
    setPicked(null);
    setPosition((p) => p + 1);
  };
  const restart = () => {
    setPosition(0);
    setPicked(null);
    setRight(0);
    setNotYet([]);
  };

  const mood: CatMood =
    step.type === 'results'
      ? 'excited'
      : picked === null
        ? 'studying'
        : step.type === 'question' && picked === quiz.questions[step.index].correctIndex
          ? 'happy'
          : 'idle';

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <CatDisplay mood={mood} variant={buddyVariant} size="small" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {buddyName} · {quiz.scopeLabel}
            </p>
            <Progress value={(Math.min(position, total) / total) * 100} className="mt-1 h-1" />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {Math.min(position + 1, total)}/{total}
          </span>
        </div>

        {step.type === 'question' && (
          <QuestionCard
            question={quiz.questions[step.index]}
            picked={picked}
            onPick={(i) => {
              setPicked(i);
              if (i === quiz.questions[step.index].correctIndex) setRight((n) => n + 1);
            }}
            onNext={next}
            last={position + 1 === total}
          />
        )}

        {step.type === 'check-in' && (
          <div className="flex flex-col gap-3 rounded-xl glass p-4">
            <p className="text-sm font-medium text-foreground">
              {(CHECK_IN[quiz.checkIns[step.index].kind] ?? CHECK_IN.question)(
                quiz.checkIns[step.index].label,
              )}
            </p>
            {quiz.checkIns[step.index].sources.map((s) => (
              <LineLink key={`${s.sessionId}-${s.page}-${s.text}`} line={s} />
            ))}
            <div className="flex gap-2">
              <Button size="sm" className="h-9" onClick={next}>
                Got it
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-9"
                onClick={() => {
                  setNotYet((list) => [...list, quiz.checkIns[step.index].label]);
                  next();
                }}
              >
                Not yet
              </Button>
            </div>
          </div>
        )}

        {step.type === 'results' && (
          <div className="flex flex-col gap-3 rounded-xl glass p-4 text-center">
            <p className="text-2xl font-bold text-foreground">
              {right} of {quiz.questions.length}
            </p>
            <p className="text-sm text-muted-foreground">
              {right === quiz.questions.length
                ? `${buddyName} is very impressed.`
                : `${buddyName} believes in you. Missed ones are worth another look.`}
            </p>
            {notYet.length > 0 && (
              <div className="text-left text-sm">
                <p className="mb-1 font-medium text-foreground">Still to look up:</p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {notYet.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-center gap-2">
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={restart}>
                <RotateCcw className="h-3.5 w-3.5" />
                Retake
              </Button>
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={onNew}>
                <RefreshCw className="h-3.5 w-3.5" />
                New quiz
              </Button>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function QuestionCard({
  question,
  picked,
  onPick,
  onNext,
  last,
}: {
  question: Quiz['questions'][number];
  picked: number | null;
  onPick: (index: number) => void;
  onNext: () => void;
  last: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl glass p-4">
      <p className="text-sm font-medium text-foreground">{renderInline(question.question)}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {question.options.map((option, i) => {
          const isRight = i === question.correctIndex;
          const answered = picked !== null;
          return (
            <Button
              key={option}
              variant={
                answered && isRight
                  ? 'default'
                  : answered && i === picked
                    ? 'destructive'
                    : 'secondary'
              }
              className={cn(
                'h-auto min-h-11 justify-start gap-1.5 whitespace-normal px-3 py-2 text-left text-sm',
              )}
              disabled={answered}
              onClick={() => onPick(i)}
            >
              {answered && isRight && <CheckCircle2 className="h-4 w-4 shrink-0" />}
              {answered && !isRight && i === picked && <XCircle className="h-4 w-4 shrink-0" />}
              {renderInline(option)}
            </Button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="flex flex-col gap-2 border-t border-[var(--glass-border)] pt-3">
          {question.explanation && (
            <p className="text-sm text-muted-foreground">{renderInline(question.explanation)}</p>
          )}
          <p className="text-xs font-medium text-foreground">From your notes:</p>
          {question.sources.map((s) => (
            <LineLink key={`${s.sessionId}-${s.page}-${s.text}`} line={s} />
          ))}
          <Button size="sm" className="mt-1 h-9 self-end" onClick={onNext}>
            {last ? 'See results' : 'Next'}
          </Button>
        </div>
      )}
    </div>
  );
}
