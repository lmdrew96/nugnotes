import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCourses } from '@/hooks/use-courses';
import { type Shot, usePageQueue } from '@/hooks/use-page-photos';
import { useSessionList, useSessionMutations } from '@/hooks/use-sessions';
import { friendlyError } from '@/lib/errors';
import { useNavigate } from '@tanstack/react-router';
import { AlertCircle, BookOpen, Camera, Check, Images, Loader2, Plus } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Id } from '../../../convex/_generated/dataModel';
import { formatDateKey, toDateKey } from '../../../convex/dateKey';

/**
 * Home: photograph a class's pages. Pick the course (last one used is already
 * picked), keep today's date, then Shoot → Next page → … → Done. Each page
 * uploads while the next is being shot.
 */
export function CaptureView() {
  const navigate = useNavigate();
  const dateInputId = useId();
  const { courses, createCourse } = useCourses();
  const sessions = useSessionList();
  const { createForClass } = useSessionMutations();

  const [courseId, setCourseId] = useState<Id<'courses'> | null>(null);
  const [classDate, setClassDate] = useState(toDateKey);
  const [sessionId, setSessionId] = useState<Id<'sessions'> | null>(null);
  const [addingCourse, setAddingCourse] = useState(false);
  const [newCourse, setNewCourse] = useState('');
  const pendingCreate = useRef<Promise<Id<'sessions'>> | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  // Preselect the course of the most recent class session, else the only course.
  const lastCourseId = useMemo(() => {
    const known = new Set(courses?.map((c) => c._id));
    return sessions.find((s) => s.courseId && known.has(s.courseId))?.courseId ?? null;
  }, [sessions, courses]);
  useEffect(() => {
    if (courseId || !courses) return;
    if (lastCourseId) setCourseId(lastCourseId);
    else if (courses.length === 1) setCourseId(courses[0]._id);
  }, [courseId, courses, lastCourseId]);

  const ensureSession = useCallback((): Promise<Id<'sessions'>> => {
    if (sessionId) return Promise.resolve(sessionId);
    if (pendingCreate.current) return pendingCreate.current;
    if (!courseId) return Promise.reject(new Error('Pick a course first.'));
    const created = createForClass({ courseId, classDate }).then((id) => {
      setSessionId(id);
      return id;
    });
    created.catch(() => {
      pendingCreate.current = null;
    });
    pendingCreate.current = created;
    return created;
  }, [sessionId, courseId, classDate, createForClass]);

  const queue = usePageQueue(ensureSession);
  const started = queue.shots.length > 0;
  const course = courses?.find((c) => c._id === courseId);

  const onPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = ''; // the same photo can be picked again
    if (picked.length > 0) queue.addFiles(picked);
  };

  const addCourse = async () => {
    const name = newCourse.trim();
    if (!name) return;
    try {
      const id = await createCourse({ name });
      setCourseId(id);
      setNewCourse('');
      setAddingCourse(false);
    } catch (error) {
      toast.error(friendlyError(error, 'Couldn’t add that course. Try again.'));
    }
  };

  const startOver = () => {
    queue.reset();
    pendingCreate.current = null;
    setSessionId(null);
    setClassDate(toDateKey());
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto p-4">
      <section className="flex flex-col gap-3 rounded-xl glass p-4">
        {started ? (
          <p className="flex items-center gap-2 text-sm text-foreground">
            <BookOpen className="h-4 w-4 text-primary" />
            Adding pages to{' '}
            <span className="font-semibold">
              {course?.name} · {formatDateKey(classDate)}
            </span>
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">Course</span>
              <div className="flex flex-wrap gap-2">
                {courses?.map((c) => (
                  <Button
                    key={c._id}
                    size="sm"
                    variant={c._id === courseId ? 'default' : 'secondary'}
                    className="h-10 gap-1.5 px-4"
                    onClick={() => setCourseId(c._id)}
                  >
                    {c._id === courseId && <Check className="h-4 w-4" />}
                    {c.name}
                  </Button>
                ))}
                {!addingCourse && courses !== undefined && courses.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-10 gap-1.5"
                    onClick={() => setAddingCourse(true)}
                  >
                    <Plus className="h-4 w-4" />
                    New course
                  </Button>
                )}
              </div>
              {(addingCourse || courses?.length === 0) && (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void addCourse();
                  }}
                >
                  <Input
                    autoFocus={addingCourse}
                    value={newCourse}
                    onChange={(e) => setNewCourse(e.target.value)}
                    placeholder="e.g. PSYC 100"
                    aria-label="New course name"
                  />
                  <Button type="submit" variant="secondary" className="h-10">
                    Add
                  </Button>
                </form>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={dateInputId} className="text-sm font-medium text-foreground">
                Class date
              </label>
              <Input
                id={dateInputId}
                type="date"
                value={classDate}
                onChange={(e) => e.target.value && setClassDate(e.target.value)}
                className="w-48"
              />
            </div>
          </>
        )}
      </section>

      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPicked}
        className="hidden"
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        multiple
        onChange={onPicked}
        className="hidden"
      />

      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          className="h-14 gap-2 text-base"
          disabled={!courseId}
          onClick={() => cameraInput.current?.click()}
        >
          <Camera className="h-5 w-5" />
          {started ? 'Next page' : 'Shoot pages'}
        </Button>
        <Button
          variant="secondary"
          className="h-11 gap-2"
          disabled={!courseId}
          onClick={() => libraryInput.current?.click()}
        >
          <Images className="h-4 w-4" />
          Add from photos
        </Button>
        {!courseId && courses !== undefined && (
          <p className="text-center text-xs text-muted-foreground">Pick a course first.</p>
        )}
      </div>

      {started && (
        <section className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {queue.shots.map((shot, index) => (
              <ShotThumb
                key={shot.id}
                shot={shot}
                number={index + 1}
                onRetry={() => queue.retry(shot.id)}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              className="h-11 flex-1"
              disabled={queue.pending > 0 || !sessionId}
              onClick={() =>
                sessionId && navigate({ to: '/study/$sessionId', params: { sessionId } })
              }
            >
              {queue.pending > 0 ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving {queue.pending} page{queue.pending > 1 ? 's' : ''}…
                </>
              ) : (
                'Done'
              )}
            </Button>
            <Button
              variant="ghost"
              className="h-11"
              disabled={queue.pending > 0}
              onClick={startOver}
            >
              New session
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function ShotThumb({
  shot,
  number,
  onRetry,
}: {
  shot: Shot;
  number: number;
  onRetry: () => void;
}) {
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-lg glass">
      <img src={shot.preview} alt={`Page ${number}`} className="h-full w-full object-cover" />
      <span className="absolute left-1 top-1 rounded bg-background/80 px-1.5 text-xs font-medium">
        {number}
      </span>
      <span className="absolute right-1 top-1 rounded-full bg-background/80 p-1">
        {shot.status === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {shot.status === 'saved' && <Check className="h-3.5 w-3.5 text-primary" />}
        {shot.status === 'failed' && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
      </span>
      {shot.status === 'failed' && (
        <button
          type="button"
          onClick={onRetry}
          className="absolute inset-x-0 bottom-0 bg-destructive/90 py-1.5 text-xs font-medium text-white"
        >
          Didn’t save. Tap to retry
        </button>
      )}
    </div>
  );
}
