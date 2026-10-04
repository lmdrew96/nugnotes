import { NotesPanel } from '@/components/notes-panel';
import { StudyNuggetNotes } from '@/components/study-nugget-notes';
import type { Recording } from '@/components/study-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useStudySettings } from '@/hooks/use-productivity';
import { renderMarkdown } from '@/lib/render-markdown';
import { useMutation } from 'convex/react';
import { BookOpen, Cat, Check, FileImage, FileText, Pencil, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

interface StudyContentProps {
  recording: Recording;
  sidebarCollapsed?: boolean;
  /**
   * Someone else's session (shared link, study room). Title, course and notes
   * become read-only — those write to the session, and only its owner may.
   */
  readOnly?: boolean;
}

export function StudyContent({ recording, sidebarCollapsed, readOnly = false }: StudyContentProps) {
  const isMobile = useIsMobile();

  // Inline editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingCourse, setEditingCourse] = useState(false);
  const [courseDraft, setCourseDraft] = useState('');
  const [coursePopoverOpen, setCoursePopoverOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const courseInputRef = useRef<HTMLInputElement>(null);

  const { settings: studySettings, updateSettings } = useStudySettings();
  const savedCourses: string[] =
    studySettings && '_id' in studySettings ? (studySettings.courses ?? []) : [];

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

  const selectCourse = async (course: string) => {
    if (course !== (recording.course ?? '')) {
      await updateSession({ id: recording.id as Id<'sessions'>, course: course || undefined });
    }
    closeCoursePopover();
  };

  const saveNewCourse = async () => {
    const trimmed = courseDraft.trim();
    if (!trimmed) return;
    await updateSession({ id: recording.id as Id<'sessions'>, course: trimmed });
    // Add to saved courses list if not already present (case-insensitive)
    const alreadyExists = savedCourses.some((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (!alreadyExists) {
      await updateSettings({ courses: [...savedCourses, trimmed] });
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

  // Viewers of someone else's session with no notes land on the document instead.
  const defaultTab = readOnly && !recording.notesMarkdown && hasDocumentText ? 'document' : 'notes';

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
                    {savedCourses.map((course) => (
                      <button
                        key={course}
                        type="button"
                        onClick={() => selectCourse(course)}
                        className={`flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded hover:bg-secondary transition-colors w-full ${
                          recording.course === course
                            ? 'text-primary font-medium'
                            : 'text-foreground'
                        }`}
                      >
                        {recording.course === course && <Check className="h-3 w-3 shrink-0" />}
                        <span className={recording.course === course ? '' : 'pl-5'}>{course}</span>
                      </button>
                    ))}
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
          <TabsTrigger value="notes" className="gap-1.5 text-xs h-7 px-3">
            <FileText className="h-3 w-3" />
            Notes
          </TabsTrigger>
          {hasDocumentText && (
            <TabsTrigger value="document" className="gap-1.5 text-xs h-7 px-3">
              <FileImage className="h-3 w-3" />
              Extracted Text
            </TabsTrigger>
          )}
          {hasNuggetNotes && (
            <TabsTrigger value="nugget-notes" className="gap-1.5 text-xs h-7 px-3">
              <Cat className="h-3 w-3" />
              Nugget Notes
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

        <TabsContent value="notes" className="h-[calc(100%-2rem)] mt-0">
          {readOnly ? (
            <ScrollArea className="h-full rounded-xl glass p-4">
              {recording.notesMarkdown ? (
                <div className="space-y-0.5 text-xs leading-relaxed text-foreground/90">
                  {renderMarkdown(recording.notesMarkdown)}
                </div>
              ) : (
                <p className="whitespace-pre-wrap leading-relaxed text-xs text-foreground/90">
                  No notes yet
                </p>
              )}
            </ScrollArea>
          ) : (
            <NotesPanel key={recording.id} sessionId={recording.id as Id<'sessions'>} />
          )}
        </TabsContent>

        <TabsContent value="nugget-notes" className="h-[calc(100%-2rem)] mt-0">
          <StudyNuggetNotes notes={recording.nuggetNotes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
