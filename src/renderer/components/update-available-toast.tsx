import {
  applyAppUpdate,
  dismissAppUpdate,
  getAppUpdateReady,
  subscribeToAppUpdate,
} from '@/lib/app-update';
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
        onClick: (event) => {
          // Keep the toast up — sonner closes it on click otherwise, and if the
          // worker still needs a moment the page looks like it ignored the click.
          event.preventDefault();
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
