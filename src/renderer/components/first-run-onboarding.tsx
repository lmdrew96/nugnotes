import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useStudySettings } from '@/hooks/use-productivity';
import { Cat, PenLine, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const STEPS = [
  {
    icon: PenLine,
    title: 'Start your first session',
    description: 'Just start typing on the home screen — the session saves itself.',
  },
  {
    icon: Sparkles,
    title: 'Upload a document',
    description:
      'Add a PDF, a photo, or handwriting, then let Nugget turn it into organized notes.',
  },
  {
    icon: Cat,
    title: 'Ask Nugget',
    description: 'Open the chat any time to ask questions about your notes.',
  },
];

export function FirstRunOnboarding() {
  const { settings, updateSettings } = useStudySettings();
  // Closes the dialog immediately on click — don't make the user wait on the
  // Convex round-trip. settings.onboardingDismissedAt is the source of truth
  // for future sessions; this is just for instant feedback in this one.
  const [dismissedLocally, setDismissedLocally] = useState(false);

  // Only show once the user has cleared the TOS gate, and only if they haven't dismissed this yet.
  const tosAccepted = Boolean(settings && 'tosAcceptedAt' in settings && settings.tosAcceptedAt);
  const dismissedRemotely = Boolean(
    settings && 'onboardingDismissedAt' in settings && settings.onboardingDismissedAt,
  );
  const open = tosAccepted && !dismissedRemotely && !dismissedLocally;

  const handleDismiss = () => {
    setDismissedLocally(true);
    updateSettings({ onboardingDismissedAt: Date.now() }).catch((err) => {
      console.error('Failed to persist onboarding dismissal:', err);
      toast.error("Couldn't save that — you might see this again next time.");
    });
  };

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(next) => !next && handleDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to NugNotes!</DialogTitle>
          <DialogDescription>Here's how to get the most out of it.</DialogDescription>
        </DialogHeader>

        <ul className="space-y-4">
          {STEPS.map((step) => (
            <li key={step.title} className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <step.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button onClick={handleDismiss} className="w-full sm:w-auto">
            Got it!
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
