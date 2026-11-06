import { SessionPages } from '@/components/session-pages';
import { SourcePages } from '@/components/source-pages';
import { StudyNuggetNotes } from '@/components/study-nugget-notes';
import type { Recording } from '@/components/study-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCourses } from '@/hooks/use-courses';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { friendlyError } from '@/lib/errors';
import { renderMarkdown } from '@/lib/render-markdown';
import { useMutation } from 'convex/react';
import {
  BookMarked,
  BookOpen,
  Camera,
  Cat,
  Check,
  FileImage,
  FileText,
  Pencil,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

interface StudyContentProps {
  recording: Recording;
  sidebarCollapsed?: boolean;
  /**
   * Someone else's session (shared link, study room). Title and course
   * become read-only — those write to the session, and only its owner may.
   */
  readOnly?: boolean;
  /** Open this page on arrival (from a thread): class page index, or source PDF page. */
  openPage?: number;
}

export function StudyContent({
  recording,
  sidebarCollapsed,
  readOnly = false,
  openPage,
}: StudyContentProps) {
  const isMobile = useIsMobile();

  // Inline editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingCourse, setEditingCourse] = useState(false);
  const [courseDraft, setCourseDraft] = useState('');
  const [coursePopoverOpen, setCoursePopoverOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const courseInputRef = useRef<HTMLInputElement>(null);

  const { courses: savedCourses = [], createCourse } = useCourses();

  const updateSession = useMutation(api.sessions.update);
  const startEditTitle = () => {
    setTitleDraft(recording.title);
    setEditingTitle(true);
  };

  const saveTitle = async () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== recording.title) {
      await updateSession({ id: recording.id as Id<'sessions'>, title: trimmed });
    }
    setEditingTitle(false);
  };

  const cancelTitle = () => {
    setEditingTitle(false);
    setTitleDraft('');
  };

  const openCoursePopover = () => {
    setCourseDraft('');
    setCoursePopoverOpen(true);
  };

  const closeCoursePopover = () => {
    setCoursePopoverOpen(false);
    setCourseDraft('');
    setEditingCourse(false);
  };

  const selectCourse = async (courseId: Id<'courses'>) => {
    try {
      if (courseId !== recording.courseId) {
        await updateSession({ id: recording.id as Id<'sessions'>, courseId });
      }
    } catch (error) {
      toast.error(friendlyError(error, 'Couldn’t change the course. Try again.'));
    }
    closeCoursePopover();
  };

  const saveNewCourse = async () => {
    const trimmed = courseDraft.trim();
    if (!trimmed) return;
    try {
      // Returns the existing course if the name is already there.
      const courseId = await createCourse({ name: trimmed });
      await updateSession({ id: recording.id as Id<'sessions'>, courseId });
    } catch (error) {
      toast.error(friendlyError(error, 'Couldn’t add that course. Try again.'));
    }
    closeCoursePopover();
  };

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  useEffect(() => {
    if (coursePopoverOpen && editingCourse) courseInputRef.current?.focus();
  }, [coursePopoverOpen, editingCourse]);

  const hasDocumentText = !!recording.documentText;
  const hasNuggetNotes = !!recording.nuggetNotes && recording.nuggetNotes.length > 0;

  // Typed notes are gone (paper-first); sessions typed before that keep a
  // read-only copy.
  const hasTypedNotes = !!recording.notesMarkdown?.trim();
  // A source (uploaded PDF) shows its text page by page instead of photos, and
  // no Key Points: Claude doesn't summarize sources into the notes layer.
  const isSource = recording.kind === 'source';
  // Pages are the owner's only (the server returns none to anyone else).
  const showPages = !readOnly && !isSource;
  const showSource = !readOnly && isSource;
  const defaultTab = showSource
    ? 'source'
    : showPages && (recording.classDate || !hasTypedNotes)
      ? 'pages'
      : hasTypedNotes
        ? 'notes'
        : hasDocumentText
          ? 'document'
          : 'nugget-notes';

  return (
    <div className="h-full flex flex-col">
      <div className={`mb-2 ${sidebarCollapsed ? 'pl-8' : ''}`}>
        {/* Editable title (desktop only, owner only) */}
        {isMobile || readOnly ? (
          <h1 className="text-base font-semibold text-foreground mb-0.5">{recording.title}</h1>
        ) : editingTitle ? (
          <div className="flex items-center gap-1 mb-0.5">
            <Input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle();
                if (e.key === 'Escape') cancelTitle();
              }}
              onBlur={saveTitle}
              className="h-7 text-sm font-semibold px-2 py-0"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              onMouseDown={(e) => {
                e.preventDefault();
                saveTitle();
              }}
              title="Save"
            >
              <Check className="h-3.5 w-3.5 text-primary" />
              <span className="sr-only">Save</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              onMouseDown={(e) => {
                e.preventDefault();
                cancelTitle();
              }}
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Cancel</span>
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEditTitle}
            className="group flex items-center gap-1.5 text-left"
          >
            <h1 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
              {recording.title}
            </h1>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>
        )}

        {/* Metadata row */}
        <p className="text-xs text-muted-foreground">
          {recording.date}
          {recording.lectureType && recording.lectureType !== 'general' && (
            <span className="ml-2 capitalize">• {recording.lectureType}</span>
          )}
        </p>

        {/* Editable course */}
        {isMobile || readOnly ? (
          recording.course ? (
            <div className="flex items-center gap-1 mt-1">
              <BookOpen className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{recording.course}</span>
            </div>
          ) : null
        ) : (
          <Popover
            open={coursePopoverOpen}
            onOpenChange={(open) => {
              if (!open) closeCoursePopover();
            }}
          >
            <PopoverTrigger asChild>
              {recording.course ? (
                <button
                  type="button"
                  onClick={openCoursePopover}
                  className="group flex items-center gap-1 mt-1"
                >
                  <BookOpen className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                    {recording.course}
                  </span>
                  <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openCoursePopover}
                  className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  <BookOpen className="h-3 w-3" />
                  <span>Add course</span>
                </button>
              )}
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              {savedCourses.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs text-muted-foreground px-1 mb-1">Your courses</p>
                  <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                    {savedCourses.map((course) => {
                      const selected = recording.courseId === course._id;
                      return (
                        <button
                          key={course._id}
                          type="button"
                          onClick={() => void selectCourse(course._id)}
                          className={`flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded hover:bg-secondary transition-colors w-full ${
                            selected ? 'text-primary font-medium' : 'text-foreground'
                          }`}
                        >
                          {selected && <Check className="h-3 w-3 shrink-0" />}
                          <span className={selected ? '' : 'pl-5'}>{course.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="border-t border-border my-2" />
                </div>
              )}
              {editingCourse ? (
                <div className="flex items-center gap-1">
                  <Input
                    ref={courseInputRef}
                    value={courseDraft}
                    onChange={(e) => setCourseDraft(e.target.value)}
                    placeholder="Course name"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveNewCourse();
                      if (e.key === 'Escape') closeCoursePopover();
                    }}
                    className="h-7 text-xs px-2 py-0 flex-1"
                    autoFocus
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      saveNewCourse();
                    }}
                    title="Save"
                  >
                    <Check className="h-3 w-3 text-primary" />
                    <span className="sr-only">Save</span>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      closeCoursePopover();
                    }}
                    title="Cancel"
                  >
                    <X className="h-3 w-3" />
                    <span className="sr-only">Cancel</span>
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingCourse(true)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-secondary transition-colors w-full"
                >
                  <Pencil className="h-3 w-3" />
                  Type a new course name
                </button>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>

      <Tabs defaultValue={defaultTab} className="flex-1 min-h-0">
        <TabsList className="mb-3 h-8">
          {showSource && (
            <TabsTrigger value="source" className="gap-1.5 text-xs h-7 px-3">
              <BookMarked className="h-3 w-3" />
              Reading
            </TabsTrigger>
          )}
          {showPages && (
            <TabsTrigger value="pages" className="gap-1.5 text-xs h-7 px-3">
              <Camera className="h-3 w-3" />
              Pages
            </TabsTrigger>
          )}
          {hasTypedNotes && (
            <TabsTrigger value="notes" className="gap-1.5 text-xs h-7 px-3">
              <FileText className="h-3 w-3" />
              Notes
            </TabsTrigger>
          )}
          {hasDocumentText && (
            <TabsTrigger value="document" className="gap-1.5 text-xs h-7 px-3">
              <FileImage className="h-3 w-3" />
              Extracted Text
            </TabsTrigger>
          )}
          {!isSource && (hasNuggetNotes || !readOnly || defaultTab === 'nugget-notes') && (
            <TabsTrigger value="nugget-notes" className="gap-1.5 text-xs h-7 px-3">
              <Cat className="h-3 w-3" />
              Key Points
            </TabsTrigger>
          )}
        </TabsList>

        {/* Extracted Text tab — from uploaded documents/images */}
        {hasDocumentText && (
          <TabsContent value="document" className="h-[calc(100%-2rem)] mt-0">
            <ScrollArea className="h-full rounded-xl glass p-4">
              <div className="text-xs text-foreground/90 leading-relaxed space-y-0.5">
                {renderMarkdown(recording.documentText ?? '')}
              </div>
            </ScrollArea>
          </TabsContent>
        )}

        {showSource && (
          <TabsContent value="source" className="h-[calc(100%-2rem)] mt-0">
            <SourcePages sessionId={recording.id as Id<'sessions'>} openPage={openPage} />
          </TabsContent>
        )}

        {showPages && (
          <TabsContent value="pages" className="h-[calc(100%-2rem)] mt-0">
            <SessionPages sessionId={recording.id as Id<'sessions'>} openPage={openPage} />
          </TabsContent>
        )}

        {hasTypedNotes && (
          <TabsContent value="notes" className="h-[calc(100%-2rem)] mt-0">
            <ScrollArea className="h-full rounded-xl glass p-4">
              <div className="space-y-0.5 text-xs leading-relaxed text-foreground/90">
                {renderMarkdown(recording.notesMarkdown ?? '')}
              </div>
            </ScrollArea>
          </TabsContent>
        )}

        {!isSource && (
          <TabsContent value="nugget-notes" className="h-[calc(100%-2rem)] mt-0">
            <StudyNuggetNotes
              notes={recording.nuggetNotes}
              sessionId={readOnly ? undefined : (recording.id as Id<'sessions'>)}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
