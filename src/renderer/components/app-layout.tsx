import { FirstRunOnboarding } from '@/components/first-run-onboarding';
import { NuggetChat } from '@/components/nugget-chat';
import { TopBar } from '@/components/top-bar';
import { TosAcceptanceModal } from '@/components/tos-acceptance-modal';
import { UpdateAvailableToast } from '@/components/update-available-toast';
import { useSessionContext } from '@/contexts/session-context';
import { useNotificationWatcher } from '@/hooks/use-notification-watcher';
import { usePresence } from '@/hooks/use-presence';
import { useSession } from '@/hooks/use-sessions';
import { Outlet } from '@tanstack/react-router';

export function AppLayout() {
  useNotificationWatcher();
  usePresence();
  const { activeSessionId, chatOpen, setChatOpen } = useSessionContext();

  const session = useSession(activeSessionId);

  const keyPoints = session?.nuggetNotes ?? [];
  const nuggetNotesText =
    keyPoints.length > 0 ? keyPoints.map((n) => `- ${n.text}`).join('\n') : undefined;

  return (
    <div className="app-bg-orbs flex h-screen flex-col">
      <TopBar />
      <main className="relative z-10 flex-1 overflow-hidden">
        <Outlet />
      </main>
      <NuggetChat
        notes={session?.notesPlainText}
        documentText={session?.documentText}
        sessionId={activeSessionId ?? undefined}
        lectureType={session?.lectureType}
        nuggetNotes={nuggetNotesText}
        isOpen={chatOpen}
        onOpenChange={setChatOpen}
      />
      <TosAcceptanceModal />
      <FirstRunOnboarding />
      <UpdateAvailableToast />
    </div>
  );
}
