import { StudyBuddySection } from '@/components/settings/study-buddy-section';
import { type Theme, useTheme } from '@/components/theme-provider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { useId } from 'react';

interface ThemeOption {
  id: string;
  name: string;
  colors: string[];
  secret?: boolean;
}

interface AppearanceTabProps {
  visibleThemes: ThemeOption[];
  activeTheme: string;
  onSelectTheme: (theme: Theme) => void;
}

export function AppearanceTab({ visibleThemes, activeTheme, onSelectTheme }: AppearanceTabProps) {
  const id = useId();
  const { backgroundMotion, setBackgroundMotion } = useTheme();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-medium text-foreground">Theme</h3>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(7rem,1fr))]">
          {visibleThemes.map((themeOption) => (
            <button
              type="button"
              key={themeOption.id}
              onClick={() => onSelectTheme(themeOption.id as Theme)}
              className={cn(
                'flex min-w-0 flex-col items-center gap-2 rounded-lg border p-3 transition-all',
                activeTheme === themeOption.id
                  ? 'border-[var(--glass-border-strong)] bg-[var(--glass-bg)] shadow-[0_0_12px_var(--glass-glow)]'
                  : 'border-[var(--glass-border)] glass-light hover:bg-[var(--glass-bg)]',
              )}
            >
              <div className="flex gap-1">
                {themeOption.colors.map((color) => (
                  <div
                    key={color}
                    className="h-4 w-4 shrink-0 rounded-sm border border-card-foreground"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <span className="flex w-full items-center justify-center gap-1 text-xs text-foreground">
                {activeTheme === themeOption.id && (
                  <Check className="h-3 w-3 shrink-0 text-accent" aria-hidden />
                )}
                <span className="truncate">{themeOption.name}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor={`${id}-motion`} className="text-sm text-foreground">
            Background motion
          </Label>
          <p className="text-xs text-muted-foreground">
            Let the theme's background drift slowly behind your notes. Turn it off if it pulls your
            eye.
          </p>
        </div>
        <Switch
          id={`${id}-motion`}
          checked={backgroundMotion}
          onCheckedChange={setBackgroundMotion}
        />
      </div>

      <StudyBuddySection />
    </div>
  );
}
