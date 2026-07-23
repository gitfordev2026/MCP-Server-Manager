'use client';

import { useTheme } from '@/context/ThemeContext';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-9 h-9 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
    );
  }

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <button
      onClick={toggleTheme}
      type="button"
      title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      className="relative p-2 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
    >
      <div className="relative w-5 h-5 flex items-center justify-center">
        {resolvedTheme === 'dark' ? (
          /* Moon Icon for Dark Mode */
          <svg
            className="w-5 h-5 text-amber-400 transform transition-transform duration-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        ) : (
          /* Sun Icon for Light Mode */
          <svg
            className="w-5 h-5 text-amber-500 transform transition-transform duration-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        )}
      </div>
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
