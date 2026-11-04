import { preparePhoto } from '@/lib/prepare-photo';
import { useUploadFile } from '@convex-dev/r2/react';
import { useMutation } from 'convex/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

/** Shrink a photo and upload it to R2; resolves to its storage key. */
export const usePhotoUpload = (): ((file: File) => Promise<string>) => {
  const uploadFile = useUploadFile(api.r2);
  return useCallback(async (file: File) => uploadFile(await preparePhoto(file)), [uploadFile]);
};

export type ShotStatus = 'saving' | 'saved' | 'failed';

export interface Shot {
  id: string;
  preview: string;
  status: ShotStatus;
}

export interface PageQueue {
  shots: Shot[];
  /** Pages still uploading. */
  pending: number;
  addFiles: (files: File[]) => void;
  retry: (shotId: string) => void;
  /** Clear the strip for a new session. Only call when nothing is pending. */
  reset: () => void;
}

/**
 * Saves photos as pages one at a time, in the order they were taken, so a
 * slow upload can never swap page 2 and page 3. Each photo uploads while the
 * next one is being shot. The session is resolved on the first save, so a
 * capture that never gets a photo never creates a session.
 */
export const usePageQueue = (ensureSession: () => Promise<Id<'sessions'>>): PageQueue => {
  const uploadPhoto = usePhotoUpload();
  const addPage = useMutation(api.pages.add);
  const [shots, setShots] = useState<Shot[]>([]);
  const files = useRef(new Map<string, File>());
  const chain = useRef<Promise<void>>(Promise.resolve());
  // The queue runs after renders; always use the latest resolver.
  const ensureSessionRef = useRef(ensureSession);
  ensureSessionRef.current = ensureSession;

  const setStatus = useCallback((id: string, status: ShotStatus) => {
    setShots((prev) => prev.map((shot) => (shot.id === id ? { ...shot, status } : shot)));
  }, []);

  const enqueue = useCallback(
    (id: string) => {
      setStatus(id, 'saving');
      chain.current = chain.current.then(async () => {
        const file = files.current.get(id);
        if (!file) return;
        try {
          const sessionId = await ensureSessionRef.current();
          const storageKey = await uploadPhoto(file);
          await addPage({ sessionId, storageKey });
          files.current.delete(id);
          setStatus(id, 'saved');
        } catch (error) {
          console.error('Saving a page failed:', error);
          setStatus(id, 'failed');
        }
      });
    },
    [addPage, uploadPhoto, setStatus],
  );

  const addFiles = useCallback(
    (picked: File[]) => {
      const added = picked.map((file) => {
        const id = crypto.randomUUID();
        files.current.set(id, file);
        return { id, preview: URL.createObjectURL(file), status: 'saving' as const };
      });
      setShots((prev) => [...prev, ...added]);
      for (const shot of added) enqueue(shot.id);
    },
    [enqueue],
  );

  const reset = useCallback(() => {
    setShots((prev) => {
      for (const shot of prev) URL.revokeObjectURL(shot.preview);
      return [];
    });
    files.current.clear();
  }, []);

  // Free the previews when the screen goes away.
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(
    () => () => {
      for (const shot of shotsRef.current) URL.revokeObjectURL(shot.preview);
    },
    [],
  );

  const pending = shots.filter((shot) => shot.status === 'saving').length;
  return { shots, pending, addFiles, retry: enqueue, reset };
};
