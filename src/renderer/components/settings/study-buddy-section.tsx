import { CatDisplay } from '@/components/cats/cat-display';
import {
  BUDDY_NAME_MAX_LENGTH,
  CAT_VARIANTS,
  type CatVariant,
  DEFAULT_BUDDY_NAME,
  DEFAULT_BUDDY_VARIANT,
  isCatVariant,
} from '@/components/cats/cat-sprites';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStudySettings } from '@/hooks/use-productivity';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';

/**
 * Pick the cat and name for the study buddy (the cursor-following cat you get
 * by triple-clicking the NugNotes title).
 */
export function StudyBuddySection() {
  const id = useId();
  const { settings, updateSettings } = useStudySettings();
  const savedVariant = isCatVariant(settings?.buddyVariant)
    ? settings.buddyVariant
    : DEFAULT_BUDDY_VARIANT;
  const savedName = settings?.buddyName || DEFAULT_BUDDY_NAME;

  const [nameInput, setNameInput] = useState(savedName);
  useEffect(() => {
    setNameInput(savedName);
  }, [savedName]);

  const save = async (updates: { buddyVariant?: CatVariant; buddyName?: string }) => {
    try {
      await updateSettings(updates);
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't save your study buddy"));
    }
  };

  const commitName = () => {
    const name = nameInput.trim() || DEFAULT_BUDDY_NAME;
    setNameInput(name);
    if (name !== savedName) void save({ buddyName: name });
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-foreground">Study buddy</h3>
        <p className="text-xs text-muted-foreground">
          Triple-click the NugNotes title to call your buddy. It follows your cursor while you
          study.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg glass-light">
          <CatDisplay mood="idle" variant={savedVariant} size="small" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor={`${id}-buddy-name`} className="text-xs text-muted-foreground">
            Name
          </Label>
          <Input
            id={`${id}-buddy-name`}
            value={nameInput}
            maxLength={BUDDY_NAME_MAX_LENGTH}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </div>
      </div>

      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(4.5rem,1fr))]">
        {CAT_VARIANTS.map((variant) => {
          const selected = variant.id === savedVariant;
          return (
            <button
              type="button"
              aria-pressed={selected}
              key={variant.id}
              onClick={() => {
                if (!selected) void save({ buddyVariant: variant.id });
              }}
              className={cn(
                'flex min-w-0 flex-col items-center gap-1 rounded-lg border p-2 transition-all',
                selected
                  ? 'border-[var(--glass-border-strong)] bg-[var(--glass-bg)] shadow-[0_0_12px_var(--glass-glow)]'
                  : 'border-[var(--glass-border)] glass-light hover:bg-[var(--glass-bg)]',
              )}
            >
              <CatDisplay mood="sleepy" variant={variant.id} size="xsmall" />
              <span className="w-full truncate text-center text-xs text-foreground">
                {variant.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
