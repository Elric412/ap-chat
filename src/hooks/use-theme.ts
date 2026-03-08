import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import type { ThemeMode, ResolvedTheme } from '../types/ui';

function resolveTheme(mode: ThemeMode, systemPreference: ResolvedTheme): ResolvedTheme {
  if (mode === 'system') return systemPreference;
  return mode;
}

export function useTheme(): {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
} {
  const theme = useAppStore((s) => s.theme);
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);
  const setTheme = useAppStore((s) => s.setTheme);
  const setResolvedTheme = useAppStore((s) => s.setResolvedTheme);

  /* Sync data-theme attribute and system preference listener */
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const systemPref: ResolvedTheme = mediaQuery.matches ? 'dark' : 'light';
    const resolved = resolveTheme(theme, systemPref);

    setResolvedTheme(resolved);
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-theme-transitioning', '');
    const timer = setTimeout(() => {
      document.documentElement.removeAttribute('data-theme-transitioning');
    }, 400);

    const handleChange = (e: MediaQueryListEvent): void => {
      if (theme === 'system') {
        const newResolved = e.matches ? 'dark' : 'light';
        setResolvedTheme(newResolved);
        document.documentElement.setAttribute('data-theme', newResolved);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => {
      clearTimeout(timer);
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [theme, setResolvedTheme]);

  const toggleTheme = useCallback(() => {
    const next: ThemeMode = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  return { theme, resolvedTheme, setTheme, toggleTheme };
}
