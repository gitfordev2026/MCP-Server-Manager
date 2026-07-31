'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem('mcp_theme') as Theme | null;
    if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
      setThemeState(savedTheme);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const activeTheme = theme === 'system' ? (media.matches ? 'dark' : 'dark') : theme;
      setResolvedTheme(activeTheme);

      if (activeTheme === 'dark') {
        root.classList.add('dark');
        root.setAttribute('data-theme', 'dark');
      } else {
        root.classList.remove('dark');
        root.setAttribute('data-theme', 'light');
      }
    };

    applyTheme();
    localStorage.setItem('mcp_theme', theme);

    const listener = () => {
      if (theme === 'system') applyTheme();
    };

    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [theme, mounted]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (resolvedTheme === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'dark' as Theme,
      resolvedTheme: 'dark' as 'light' | 'dark',
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return context;
}
