import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { usePageQueue, usePhotoUpload } from '@/hooks/use-page-photos';
import { useMutation, useQuery } from 'convex/react';
import {
  AlertCircle,
  Camera,
  ChevronLeft,
  ChevronRight,
  Images,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

interface SessionPagesProps {
  sessionId: Id<'sessions'>;
}

/** A session's photographed pages, in order. Tap a page to enlarge, move, retake or delete it. */
export function SessionPages({ sessionId }: SessionPagesProps) {
  const pages = useQuery(api.pages.list, { sessionId });
  const ensureSession = useCallback(() => Promise.resolve(sessionId), [sessionId]);
  const queue = usePageQueue(ensureSession);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const onPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (picked.length > 0) queue.addFiles(picked);
  };

  const failed = queue.shots.filter((shot) => shot.status === 'failed');
  const openPage = openIndex !== null ? pages?.[openIndex] : undefined;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPicked}
        className="hidden"
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        multiple
        onChange={onPicked}
        className="hidden"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="gap-1.5" onClick={() => cameraInput.current?.click()}>
          <Camera className="h-4 w-4" />
          Add pages
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5"
          onClick={() => libraryInput.current?.click()}
        >
          <Images className="h-4 w-4" />
          From photos
        </Button>
        {queue.pending > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Saving {queue.pending} page{queue.pending > 1 ? 's' : ''}…
          </span>
        )}
        {failed.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-destructive"
            onClick={() => {
              for (const shot of failed) queue.retry(shot.id);
            }}
          >
            <AlertCircle className="h-4 w-4" />
            {failed.length} didn’t save. Retry
          </Button>
        )}
      </div>

      {pages === undefined ? (
        <p className="text-sm text-muted-foreground">Loading pages…</p>
      ) : pages.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pages yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {pages.map((page, index) => (
            <button
              key={page._id}
              type="button"
              onClick={() => setOpenIndex(index)}
              className="relative aspect-[3/4] overflow-hidden rounded-lg glass"
            >
              <img
                src={page.url}
                alt={`Page ${index + 1}`}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              <span className="absolute left-1 top-1 rounded bg-background/80 px-1.5 text-xs font-medium">
                {index + 1}
              </span>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!openPage} onOpenChange={(open) => !open && setOpenIndex(null)}>
        <DialogContent className="flex max-h-[95vh] max-w-3xl flex-col gap-3 p-3">
          {openPage && openIndex !== null && pages && (
            <PageViewer
              key={openPage._id}
              page={openPage}
              number={openIndex + 1}
              total={pages.length}
              onMoved={(direction) => setOpenIndex(openIndex + direction)}
              onDeleted={() => setOpenIndex(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PageViewer({
  page,
  number,
  total,
  onMoved,
  onDeleted,
}: {
  page: { _id: Id<'pages'>; url: string };
  number: number;
  total: number;
  onMoved: (direction: -1 | 1) => void;
  onDeleted: () => void;
}) {
  const movePage = useMutation(api.pages.move);
  const replacePage = useMutation(api.pages.replace);
  const removePage = useMutation(api.pages.remove);
  const uploadPhoto = usePhotoUpload();
  const retakeInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'retake' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fail = (what: string, error: unknown) => {
    console.error(`Page ${what} failed:`, error);
    toast.error(`Couldn’t ${what} the page. Try again.`);
  };

  const move = async (direction: -1 | 1) => {
    try {
      await movePage({ pageId: page._id, direction });
      onMoved(direction);
    } catch (error) {
      fail('move', error);
    }
  };

  const retake = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('retake');
    try {
      await replacePage({ pageId: page._id, storageKey: await uploadPhoto(file) });
    } catch (error) {
      fail('replace', error);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('delete');
    try {
      await removePage({ pageId: page._id });
      onDeleted();
    } catch (error) {
      fail('delete', error);
      setBusy(null);
    }
  };

  return (
    <>
      <DialogTitle className="text-sm">
        Page {number} of {total}
      </DialogTitle>
      <div className="min-h-0 flex-1 overflow-auto">
        <img src={page.url} alt={`Page ${number}`} className="mx-auto max-h-[75vh] w-auto" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="gap-1"
          disabled={number === 1 || busy !== null}
          onClick={() => void move(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
          Earlier
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="gap-1"
          disabled={number === total || busy !== null}
          onClick={() => void move(1)}
        >
          Later
          <ChevronRight className="h-4 w-4" />
        </Button>
        <input
          ref={retakeInput}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void retake(e)}
          className="hidden"
        />
        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5"
          disabled={busy !== null}
          onClick={() => retakeInput.current?.click()}
        >
          {busy === 'retake' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Retake
        </Button>
        <Button
          size="sm"
          variant={confirmDelete ? 'destructive' : 'ghost'}
          className="ml-auto gap-1.5"
          disabled={busy !== null}
          onClick={() => (confirmDelete ? void remove() : setConfirmDelete(true))}
        >
          {busy === 'delete' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          {confirmDelete ? 'Tap again to delete' : 'Delete'}
        </Button>
      </div>
    </>
  );
}
