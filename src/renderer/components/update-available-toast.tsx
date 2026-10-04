import {
  applyAppUpdate,
  dismissAppUpdate,
  getAppUpdateReady,
  subscribeToAppUpdate,
} from '@/lib/app-update';
import { flushPendingSaves } from '@/lib/pending-save';
import { useEffect, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

const TOAST_ID = 'app-update-available';

/** Offers the new build to a stale tab. */
export function UpdateAvailableToast(): null {
  const updateReady = useSyncExternalStore(subscribeToAppUpdate, getAppUpdateReady);

  useEffect(() => {
    if (!updateReady) {
      toast.dismiss(TOAST_ID);
      return;
    }
    toast('A new version of NugNotes is ready', {
      id: TOAST_ID,
      description: 'Refresh when you’re at a good stopping point.',
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: 'Refresh',
        onClick: async (event) => {
          // Keep the toast up — sonner closes it on click otherwise, and if the
          // worker still needs a moment the page looks like it ignored the click.
          event.preventDefault();
          // An open note may hold edits that haven't reached the server yet;
          // a reload would lose them, so hold off until they land.
          if (!(await flushPendingSaves())) {
            toast.error("Your latest notes haven't saved yet", {
              description:
                'NugNotes will update once you are back online. Try Refresh again in a moment.',
            });
            return;
          }
          toast.loading('Updating NugNotes…', {
            id: TOAST_ID,
            description: undefined,
            action: undefined,
            cancel: undefined,
          });
          applyAppUpdate();
        },
      },
      cancel: { label: 'Not now', onClick: dismissAppUpdate },
    });
  }, [updateReady]);

  return null;
}
