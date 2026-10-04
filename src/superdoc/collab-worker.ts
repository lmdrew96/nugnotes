/**
 * SuperDoc's collaboration worker, with NugNotes' Convex provider adapter
 * (ported from Folio).
 *
 * SuperDoc v2 owns its Y.Doc inside this worker and refuses an app-supplied
 * one, so custom backends plug in as a named provider adapter. The editor
 * selects it with
 *   collaboration: { providerType: 'extension', adapterId: 'convex',
 *                    documentId: <DocKey>, roomMode, providerOptions: { convexUrl }, token }
 * and `workerUrls.collaboration` pointing at the built file.
 *
 * Built by scripts/build-superdoc-assets.mjs into public/superdoc/ (not
 * bundled by Vite, since SuperDoc spawns it from a URL).
 */
import { ConvexClient } from 'convex/browser';
import { bootstrapSuperDocCollaborationWorker } from 'superdoc/collaboration-worker';
import { attachConvexSync } from './convex-provider';
import { SAVE_STATUS_CHANNEL, type SaveStatusMessage } from './save-status';

type ProviderOptions = { convexUrl: string };

// Tells the page when a note's edits have reached Convex (see save-status.ts).
const saveStatus =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SAVE_STATUS_CHANNEL);

bootstrapSuperDocCollaborationWorker({
  providerAdapters: {
    convex: ({ documentId, providerOptions, token }) => ({
      // SuperDoc requires a built-in family name; the transport is ours.
      providerFamily: 'y-websocket',
      attach({ ydoc, onSynced, onDegraded, onFailed }) {
        const { convexUrl } = providerOptions as ProviderOptions;
        const client = new ConvexClient(convexUrl);
        // `token` proxies to the page's Clerk getToken, which returns a fresh
        // token once the cached one expires — so re-auth after expiry works.
        client.setAuth(async () => (typeof token === 'function' ? await token() : (token ?? null)));
        const sync = attachConvexSync({
          client,
          docKey: documentId,
          ydoc,
          callbacks: { onSynced, onDegraded, onFailed },
          onSaveStatus: (status) =>
            saveStatus?.postMessage({ docKey: documentId, ...status } satisfies SaveStatusMessage),
        });
        const close = () => void sync.destroy();
        return { disconnect: close, destroy: close };
      },
    }),
  },
});
