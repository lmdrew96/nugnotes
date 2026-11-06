import { Button } from '@/components/ui/button';
import { friendlyError } from '@/lib/errors';
import { useUploadFile } from '@convex-dev/r2/react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from 'convex/react';
import { FileUp, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

/** Bigger than any slide deck or reading; keeps an accidental huge file out. */
const MAX_BYTES = 50 * 1024 * 1024;

interface SourceUploadButtonProps {
  courseId: Id<'courses'> | null;
  classDate: string;
}

/**
 * Add slides or a reading (PDF) to the picked course as a source dated on the
 * picked day, then open it. Its text is read page by page in the background.
 */
export function SourceUploadButton({ courseId, classDate }: SourceUploadButtonProps) {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const uploadFile = useUploadFile(api.r2);
  const createSource = useMutation(api.sources.create);
  const [uploading, setUploading] = useState(false);

  const onPicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !courseId) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('That isn’t a PDF. Slides and readings need to be PDFs.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('That PDF is over 50 MB. Try a smaller file.');
      return;
    }
    setUploading(true);
    try {
      const storageKey = await uploadFile(file);
      const sessionId = await createSource({
        courseId,
        classDate,
        storageKey,
        fileName: file.name,
      });
      navigate({ to: '/study/$sessionId', params: { sessionId } });
    } catch (error) {
      toast.error(friendlyError(error, 'Couldn’t add that PDF. Try again.'));
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => void onPicked(e)}
        className="hidden"
      />
      <Button
        variant="ghost"
        className="h-11 gap-2"
        disabled={!courseId || uploading}
        onClick={() => input.current?.click()}
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
        {uploading ? 'Adding PDF…' : 'Add slides or a reading (PDF)'}
      </Button>
    </>
  );
}
