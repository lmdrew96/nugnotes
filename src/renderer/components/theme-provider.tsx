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
}

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

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    localStorage.setItem('nugnotes-theme', theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
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
