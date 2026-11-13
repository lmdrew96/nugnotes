import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { ArrowLeft, Brain, ChevronRight, EyeOff, Layers, Pencil, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import { formatDateKey } from '../../../convex/dateKey';

/** Pieces of the Threads list for themes: card, open-theme header, rename, dismissed. */

export type ThemeList = NonNullable<FunctionReturnType<typeof api.themes.listForCourse>>;
export type Theme = ThemeList['themes'][number];

const dateRange = (from?: string, to?: string) =>
  !from
    ? ''
    : from === to || !to
      ? formatDateKey(from)
      : `${formatDateKey(from)} – ${formatDateKey(to)}`;

export function ThemeCard({
  theme,
  threadCount,
  onClick,
}: {
  theme: Pick<Theme, 'name'> & Partial<Theme>;
  threadCount?: number;
  onClick: () => void;
}) {
  const threads = threadCount ?? theme.threadCount ?? 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg bg-[var(--glass-bg-light)] px-3 py-2 text-left transition-colors hover:bg-[var(--glass-bg)]"
    >
      <Layers className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{theme.name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {threads} thread{threads === 1 ? '' : 's'}
          {theme.sessionCount !== undefined &&
            ` · ${theme.sessionCount} session${theme.sessionCount === 1 ? '' : 's'}`}
          {theme.from && ` · ${dateRange(theme.from, theme.to)}`}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** An open theme: back to all themes, its name (tap the pencil to rename), quiz, dismiss. */
export function ThemeHeader({
  theme,
  onBack,
  onQuiz,
}: {
  theme: Theme | undefined;
  onBack: () => void;
  onQuiz?: () => void;
}) {
  const setDismissed = useMutation(api.themes.setDismissed);
  return (
    <div className="flex flex-col gap-1 pb-2">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">All themes</span>
        </Button>
        {theme ? (
          <ThemeName theme={theme} />
        ) : (
          <span className="text-sm font-semibold text-foreground">Not in a theme yet</span>
        )}
      </div>
      {theme && (
        <div className="flex gap-1 pl-8">
          {onQuiz && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={onQuiz}>
              <Brain className="h-3.5 w-3.5" />
              Quiz me
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            title="This grouping is wrong: put its ideas in other themes"
            onClick={() =>
              void setDismissed({ themeId: theme._id, dismissed: true }).catch((error: unknown) =>
                toast.error(friendlyError(error, 'Couldn’t dismiss that theme. Try again.')),
              )
            }
          >
            <EyeOff className="h-3.5 w-3.5" />
            Dismiss theme
          </Button>
        </div>
      )}
    </div>
  );
}

/** A theme's name, renamed in place. */
export function ThemeName({ theme, small }: { theme: Theme; small?: boolean }) {
  const rename = useMutation(api.themes.rename);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(theme.name);

  const save = async () => {
    setEditing(false);
    if (!draft.trim() || draft.trim() === theme.name) return setDraft(theme.name);
    try {
      await rename({ themeId: theme._id, name: draft });
    } catch (error) {
      setDraft(theme.name);
      toast.error(friendlyError(error, 'Couldn’t rename that theme. Try again.'));
    }
  };

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(theme.name);
            setEditing(false);
          }
        }}
        aria-label="Theme name"
        className="h-7 text-sm"
      />
    );
  }
  return (
    <span className="group flex min-w-0 items-center gap-1 px-1">
      <span
        className={cn(
          'truncate text-foreground',
          small ? 'text-xs font-medium' : 'text-sm font-semibold',
        )}
      >
        {theme.name}
      </span>
      <button
        type="button"
        className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
        onClick={() => setEditing(true)}
        title="Rename this theme"
      >
        <Pencil className="h-3 w-3" />
        <span className="sr-only">Rename</span>
      </button>
    </span>
  );
}

export function DismissedThemes({ items }: { items: ThemeList['dismissed'] }) {
  const setDismissed = useMutation(api.themes.setDismissed);
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="pt-3">
      <button
        type="button"
        className="px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide' : 'Show'} {items.length} dismissed theme{items.length === 1 ? '' : 's'}
      </button>
      {open &&
        items.map((t) => (
          <div key={t._id} className="flex items-center gap-2 px-2 py-1 text-sm opacity-70">
            <span className="min-w-0 flex-1 truncate">{t.name}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() =>
                void setDismissed({ themeId: t._id, dismissed: false }).catch((error: unknown) =>
                  toast.error(friendlyError(error, 'Couldn’t bring that theme back. Try again.')),
                )
              }
            >
              <Undo2 className="h-3 w-3" />
              Bring back
            </Button>
          </div>
        ))}
    </div>
  );
}
