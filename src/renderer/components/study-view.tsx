import { DocumentUpload } from '@/components/document-upload';
import { ShareSessionModal } from '@/components/messages/share-session-modal';
import { RecordingsSidebar } from '@/components/recordings-sidebar';
import { StudyContent } from '@/components/study-content';
import { StudyTools } from '@/components/study-tools/index';
import { Button } from '@/components/ui/button';
import { useSessionContext } from '@/contexts/session-context';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useSession, useSessionList, useSessionMutations, useTrash } from '@/hooks/use-sessions';
import { cn } from '@/lib/utils';
import { useMatch, useNavigate } from '@tanstack/react-router';
import { PanelLeft } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Id } from '../../../convex/_generated/dataModel';

type SessionId = Id<'sessions'>;

export interface SessionSummary {
  id: string;
  title: string;
  date: string;
  createdAt: number;
  lectureType?: string;
  course?: string;
}

/** A session as the study view renders it. */
export interface Recording {
  id: string;
  title: string;
  date: string;
  /** Markdown copy of the notes, for read-only views. */
  notesMarkdown: string;
  lectureType?: string;
  course?: string;
  nuggetNotes?: { text: string }[];
  documentText?: string;
}

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export function StudyView() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { setActiveSessionId, setNuggetNotes } = useSessionContext();
  const sessions = useSessionList();
  const { deleteSession, restoreSession, permanentDeleteSession } = useSessionMutations();
  const trashedSessions = useTrash();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [shareSessionId, setShareSessionId] = useState<string | null>(null);

  // Read session ID from route params (undefined when on /study)
  const sessionMatch = useMatch({ from: '/study/$sessionId', shouldThrow: false });
  const selectedId = sessionMatch?.params.sessionId ?? null;

  // Sync selected session to context for NuggetChat
  useEffect(() => {
    setActiveSessionId(selectedId as SessionId | null);
    setNuggetNotes([]);
  }, [selectedId, setActiveSessionId, setNuggetNotes]);

  // Clear context on unmount
  useEffect(() => {
    return () => setActiveSessionId(null);
  }, [setActiveSessionId]);

  const handleDelete = useCallback(
    (recordingId: string) => {
      deleteSession({ id: recordingId as SessionId });
      if (selectedId === recordingId) {
        navigate({ to: '/study' });
      }
    },
    [deleteSession, selectedId, navigate],
  );

  const handleRestore = useCallback(
    (recordingId: string) => {
      restoreSession({ id: recordingId as SessionId });
    },
    [restoreSession],
  );

  const handlePermanentDelete = useCallback(
    (recordingId: string) => {
      permanentDeleteSession({ id: recordingId as SessionId });
    },
    [permanentDeleteSession],
  );

  // Navigate to session route instead of local state
  const handleSelect = useCallback(
    (recording: SessionSummary) => {
      navigate({ to: '/study/$sessionId', params: { sessionId: recording.id } });
      if (isMobile) setSidebarOpen(false);
    },
    [isMobile, navigate],
  );

  // Fetch full session data for the selected recording only
  // (sessions.get joins notes from the separate sessionNotes table)
  const fullSession = useSession(selectedId as SessionId | null);

  // Sidebar gets lightweight metadata only — no notes or document text
  const sidebarRecordings: SessionSummary[] = sessions.map((session) => ({
    id: session._id,
    title: session.title,
    date: formatDate(session.createdAt),
    createdAt: session.createdAt,
    lectureType: session.lectureType,
    course: session.course,
  }));

  const trashedRecordings: SessionSummary[] = trashedSessions.map((session) => ({
    id: session._id,
    title: session.title,
    date: formatDate(session.createdAt),
    createdAt: session.createdAt,
    lectureType: session.lectureType,
    course: session.course,
  }));

  // Build full Recording for StudyContent from sessions.get result
  const selectedRecording: Recording | null = fullSession
    ? {
        id: fullSession._id,
        title: fullSession.title,
        date: formatDate(fullSession.createdAt),
        notesMarkdown: fullSession.notesMarkdown || '',
        lectureType: fullSession.lectureType,
        course: fullSession.course,
        nuggetNotes: fullSession.nuggetNotes,
        documentText: fullSession.documentText,
      }
    : null;

  return (
    <div className="flex h-full relative gap-3 p-3">
      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={() => {}}
          role="presentation"
        />
      )}

      {/* Collapsible sidebar */}
      {sidebarOpen && (
        <div
          className={cn(
            'w-60 rounded-xl glass shrink-0 overflow-hidden',
            isMobile && 'fixed left-0 top-[4.5rem] bottom-0 z-30 glass-heavy rounded-l-none',
          )}
        >
          <RecordingsSidebar
            recordings={sidebarRecordings}
            trashedRecordings={trashedRecordings}
            selectedId={selectedRecording?.id}
            onSelect={handleSelect}
            onDelete={handleDelete}
            onRestore={handleRestore}
            onPermanentDelete={handlePermanentDelete}
            onShare={(id) => setShareSessionId(id)}
            onCollapse={() => setSidebarOpen(false)}
          />
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0 rounded-xl glass">
        {/* Collapse toggle when sidebar is hidden */}
        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-5 top-[1.6rem] z-10 h-7 w-7"
            onClick={() => setSidebarOpen(true)}
            title="Show sessions"
          >
            <PanelLeft className="h-4 w-4" />
            <span className="sr-only">Show sessions</span>
          </Button>
        )}

        {selectedRecording ? (
          <>
            <div className="flex-1 overflow-auto p-5">
              <StudyContent recording={selectedRecording} sidebarCollapsed={!sidebarOpen} />
            </div>
            <div className="border-t border-[var(--glass-border)]">
              <StudyTools sessionId={selectedRecording.id as Id<'sessions'>} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center space-y-4">
              <div>
                <h3 className="mb-1 text-sm font-medium text-foreground">Select a session</h3>
                <p className="text-xs text-muted-foreground">
                  Choose from the sidebar, or upload a document
                </p>
              </div>
              <div className="max-w-xs mx-auto space-y-3">
                <DocumentUpload
                  onSessionCreated={(id) =>
                    navigate({ to: '/study/$sessionId', params: { sessionId: id } })
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <ShareSessionModal
        open={!!shareSessionId}
        onOpenChange={(open) => !open && setShareSessionId(null)}
        sessionId={shareSessionId as Id<'sessions'> | null}
      />
    </div>
  );
}
