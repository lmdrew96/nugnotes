import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';

export type Theme =
  | 'default'
  | 'swirl'
  | 'soft-focus'
  | 'blackout'
  | 'chaos-cat'
  | 'high-contrast-dark'
  | 'high-contrast-light'
  | 'nyan-cat-dark'
  | 'nyan-cat-light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Whether the theme's background animates (Settings → Appearance). */
  backgroundMotion: boolean;
  setBackgroundMotion: (on: boolean) => void;
}

const MOTION_KEY = 'nugnotes-background-motion';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

export function ThemeProvider({ children, defaultTheme = 'default' }: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('nugnotes-theme');
      if (stored && isValidTheme(stored)) {
        return stored;
      }
    }
    return defaultTheme;
  });

  // Per device, like the theme: on unless this device turned it off.
  const [backgroundMotion, setBackgroundMotion] = useState(() =>
    typeof window === 'undefined' ? true : localStorage.getItem(MOTION_KEY) !== 'off',
  );

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    localStorage.setItem('nugnotes-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-motion', backgroundMotion ? 'on' : 'off');
    localStorage.setItem(MOTION_KEY, backgroundMotion ? 'on' : 'off');
  }, [backgroundMotion]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, backgroundMotion, setBackgroundMotion }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

function isValidTheme(value: string): value is Theme {
  return [
    'default',
    'swirl',
    'soft-focus',
    'blackout',
    'chaos-cat',
    'high-contrast-dark',
    'high-contrast-light',
    'nyan-cat-dark',
    'nyan-cat-light',
  ].includes(value);
}
