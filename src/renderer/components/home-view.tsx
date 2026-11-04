import { DocumentUpload } from '@/components/document-upload';
import { type LectureType, LectureTypeSelect } from '@/components/lecture-type-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSessionContext } from '@/contexts/session-context';
import { useStudySettings } from '@/hooks/use-productivity';
import { useSessionMutations } from '@/hooks/use-sessions';
import { useNavigate } from '@tanstack/react-router';
import { BookOpen, FilePlus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Id } from '../../../convex/_generated/dataModel';

const NO_COURSE = 'none';

/**
 * Start a session from photos or files. A fresh page has no session row; the
 * first upload or drawing creates one. (Interim until course-based capture.)
 */
export function HomeView() {
  const navigate = useNavigate();
  const { setActiveSessionId } = useSessionContext();
  const { createSession, updateSession } = useSessionMutations();
  const { settings } = useStudySettings();
  const courses = settings && '_id' in settings ? (settings.courses ?? []) : [];

  const [sessionId, setSessionId] = useState<Id<'sessions'> | null>(null);
  // Bumped by "New session" to remount the upload panel empty.
  const [pageKey, setPageKey] = useState(0);
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState(NO_COURSE);
  const [lectureType, setLectureType] = useState<LectureType>('general');

  // One in-flight create shared by uploads and drawings, so two landing
  // together can't make two sessions.
  const pendingCreate = useRef<Promise<Id<'sessions'>> | null>(null);
  // The page currently on screen. An upload still in flight from before "New
  // session" carries its own pageKey, so it makes its own session and never
  // touches this page's state.
  const currentPage = useRef(0);

  const ensureSession = useCallback((): Promise<Id<'sessions'>> => {
    if (sessionId) return Promise.resolve(sessionId);
    const isCurrentPage = pageKey === currentPage.current;
    if (isCurrentPage && pendingCreate.current) return pendingCreate.current;

    const chosenCourse = course !== NO_COURSE ? course : undefined;
    const now = new Date().toLocaleString();
    const created: Promise<Id<'sessions'>> = createSession({
      title: title.trim() || (chosenCourse ? `${chosenCourse} — ${now}` : `Notes ${now}`),
      lectureType,
      course: chosenCourse,
    })
      .then((id) => {
        if (pageKey === currentPage.current) setSessionId(id);
        return id;
      })
      .catch((error: unknown) => {
        if (pendingCreate.current === created) pendingCreate.current = null;
        const message = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`Couldn't create the session: ${message}`);
        throw error;
      });
    if (isCurrentPage) pendingCreate.current = created;
    return created;
  }, [sessionId, pageKey, title, course, lectureType, createSession]);

  // Nugget chat follows the session being built.
  useEffect(() => {
    setActiveSessionId(sessionId);
  }, [sessionId, setActiveSessionId]);

  useEffect(() => {
    return () => setActiveSessionId(null);
  }, [setActiveSessionId]);

  const saveDetail = useCallback(
    async (patch: { title?: string; course?: string; lectureType?: string }) => {
      if (!sessionId) return; // Picked up when the session is created.
      try {
        await updateSession({ id: sessionId, ...patch });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`Couldn't save: ${message}`);
      }
    },
    [sessionId, updateSession],
  );

  const startNewSession = () => {
    currentPage.current += 1;
    pendingCreate.current = null;
    setSessionId(null);
    setTitle('');
    setCourse(NO_COURSE);
    setLectureType('general');
    setPageKey(currentPage.current);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col gap-3 overflow-y-auto p-4">
      <div className="flex flex-col gap-2 rounded-xl glass p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">Session</span>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5" onClick={startNewSession}>
            <FilePlus className="h-3.5 w-3.5" />
            New session
          </Button>
        </div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            const trimmed = title.trim();
            if (trimmed) void saveDetail({ title: trimmed });
          }}
          placeholder="Title (optional)"
          aria-label="Session title"
          className="h-8 text-xs"
        />
        <LectureTypeSelect
          value={lectureType}
          onChange={(value) => {
            setLectureType(value);
            void saveDetail({ lectureType: value });
          }}
        />
        {courses.length > 0 && (
          <Select
            value={course}
            onValueChange={(value) => {
              setCourse(value);
              void saveDetail({ course: value === NO_COURSE ? undefined : value });
            }}
          >
            <SelectTrigger className="h-8 w-full text-xs" aria-label="Course">
              <SelectValue placeholder="Course (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_COURSE} className="text-xs">
                No course
              </SelectItem>
              {courses.map((c) => (
                <SelectItem key={c} value={c} className="text-xs">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {sessionId && (
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5"
            onClick={() => navigate({ to: '/study/$sessionId', params: { sessionId } })}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Study this session
          </Button>
        )}
      </div>

      <DocumentUpload key={pageKey} resolveTargetSession={ensureSession} />
    </div>
  );
}
