import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { friendlyError } from '@/lib/errors';
import { useMutation, useQuery } from 'convex/react';
import { AlertCircle, ExternalLink, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

/**
 * A source's text page by page, exactly as the PDF has it (the document's own
 * words, never a summary), with a link to the PDF itself.
 */
export function SourcePages({ sessionId }: { sessionId: Id<'sessions'> }) {
  const source = useQuery(api.sources.get, { sessionId });
  const retry = useMutation(api.sources.retry);

  if (source === undefined) {
    return <Loader2 className="m-4 h-4 w-4 animate-spin text-muted-foreground" />;
  }
  if (source === null) {
    return <p className="p-4 text-sm text-muted-foreground">This source isn’t available.</p>;
  }

  const blank = source.pages.filter((p) => !p.text).length;

  return (
    <ScrollArea className="h-full rounded-xl glass p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {source.status === 'done' &&
              `${source.pages.length} page${source.pages.length === 1 ? '' : 's'}, quoted as the PDF has them.`}
          </p>
          {source.fileUrl && (
            <a
              href={source.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Open the PDF
            </a>
          )}
        </div>

        {source.status === 'pending' && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading the PDF…
          </p>
        )}

        {source.status === 'failed' && (
          <div className="flex flex-col items-start gap-2">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Nugget couldn’t read this PDF.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="gap-1.5"
              onClick={() =>
                void retry({ sessionId }).catch((error: unknown) =>
                  toast.error(friendlyError(error, 'Couldn’t start reading it. Try again.')),
                )
              }
            >
              <RotateCcw className="h-4 w-4" />
              Try again
            </Button>
          </div>
        )}

        {source.status === 'done' && blank > 0 && (
          <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            {blank === source.pages.length
              ? 'This PDF has no text Nugget can read. It may be scanned images.'
              : `${blank} page${blank === 1 ? ' has' : 's have'} no readable text (maybe a picture or a scan).`}
          </p>
        )}

        {source.pages
          .filter((p) => p.text)
          .map((p) => (
            <section key={p.page} className="flex flex-col gap-1">
              <h3 className="text-xs font-semibold text-muted-foreground">p. {p.page}</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {p.text}
              </p>
            </section>
          ))}
      </div>
    </ScrollArea>
  );
}
