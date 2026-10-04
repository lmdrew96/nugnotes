import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useExamRoomSessionContent } from '@/hooks/use-exam-room';
import { renderMarkdown } from '@/lib/render-markdown';
import { BookOpen, FileText, Loader2, User } from 'lucide-react';
import type { Id } from '../../../../convex/_generated/dataModel';

interface ExamSessionViewerProps {
  examRoomId: Id<'examRooms'>;
  sessionId: Id<'sessions'> | null;
  open: boolean;
  onClose: () => void;
}

export function ExamSessionViewer({
  examRoomId,
  sessionId,
  open,
  onClose,
}: ExamSessionViewerProps) {
  const { content, isLoading } = useExamRoomSessionContent(
    open ? examRoomId : null,
    open ? sessionId : null,
  );

  const hasNotes = !!(content?.notesMarkdown || content?.notesPlainText);
  const hasNuggetNotes = !!(content?.nuggetNotes && content.nuggetNotes.length > 0);
  const hasDocumentText = !!content?.documentText;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          {isLoading ? (
            <>
              <DialogTitle>Loading session...</DialogTitle>
              <DialogDescription>Fetching session content</DialogDescription>
            </>
          ) : content ? (
            <>
              <DialogTitle className="truncate">{content.title}</DialogTitle>
              <DialogDescription className="flex items-center gap-3 flex-wrap">
                {content.course && (
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    {content.course}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />@{content.owner.username}
                </span>
                {content.lectureType && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                    {content.lectureType}
                  </span>
                )}
              </DialogDescription>
            </>
          ) : (
            <>
              <DialogTitle>Session not found</DialogTitle>
              <DialogDescription>
                This session may have been removed from the exam room.
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && content && (
          <Tabs
            defaultValue={hasNotes ? 'notes' : hasDocumentText ? 'document' : 'nugget'}
            className="flex-1 flex flex-col min-h-0"
          >
            <TabsList className="shrink-0 w-full justify-start">
              {hasNotes && (
                <TabsTrigger value="notes" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Notes
                </TabsTrigger>
              )}
              {hasDocumentText && (
                <TabsTrigger value="document" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Document
                </TabsTrigger>
              )}
              {hasNuggetNotes && (
                <TabsTrigger value="nugget" className="gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" />
                  Nugget Notes
                </TabsTrigger>
              )}
            </TabsList>

            <div className="flex-1 min-h-0 mt-2">
              {hasNotes && (
                <TabsContent value="notes" className="h-full m-0">
                  <ScrollArea className="h-[50vh]">
                    <div className="pr-4 text-sm text-foreground space-y-1">
                      {renderMarkdown(content.notesMarkdown || content.notesPlainText || '')}
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}

              {hasDocumentText && (
                <TabsContent value="document" className="h-full m-0">
                  <ScrollArea className="h-[50vh]">
                    <div className="pr-4 text-sm text-foreground space-y-1">
                      {renderMarkdown(content.documentText ?? '')}
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}

              {hasNuggetNotes && (
                <TabsContent value="nugget" className="h-full m-0">
                  <ScrollArea className="h-[50vh]">
                    <div className="pr-4 space-y-2">
                      {content.nuggetNotes?.map((note, idx) => (
                        <div
                          // Notes have no id; their order is stable for a saved session.
                          // biome-ignore lint/suspicious/noArrayIndexKey: see above
                          key={idx}
                          className="rounded-lg p-3 glass-light border border-[var(--glass-border)]"
                        >
                          <div className="text-sm text-foreground">{renderMarkdown(note.text)}</div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}
            </div>

            {/* Empty state when no content at all */}
            {!hasNotes && !hasDocumentText && !hasNuggetNotes && (
              <div className="flex flex-col items-center justify-center py-12">
                <FileText className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground mt-3">
                  This session has no viewable content yet.
                </p>
              </div>
            )}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
