import { TranscriptLineView } from '@/components/page-transcript';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import type { ShownLine } from '../../../convex/gaps';

/**
 * One of the student's lines (or a source's), with where it's from and a link
 * that opens the exact page.
 */
export function LineLink({ line, showWhere = true }: { line: ShownLine; showWhere?: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-0.5">
      {showWhere && (
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {line.date && <span>{line.date}</span>}
          <span className="text-foreground/80">{line.title}</span>
          {line.isSource && (
            <span className="rounded-full bg-accent/20 px-1.5 text-[10px] text-foreground">
              Source
            </span>
          )}
        </p>
      )}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 whitespace-pre-wrap font-mono text-sm leading-relaxed">
          <TranscriptLineView text={line.text} />
        </div>
        {line.label && line.page !== undefined && (
          <button
            type="button"
            className="mt-0.5 flex shrink-0 items-center gap-0.5 text-xs text-primary hover:underline"
            onClick={() =>
              navigate({
                to: '/study/$sessionId',
                params: { sessionId: line.sessionId },
                search: { page: line.page },
              })
            }
          >
            {line.label}
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
