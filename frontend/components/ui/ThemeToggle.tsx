'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
    const { theme, setTheme, systemTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="w-9 h-9" />;
    }

    const currentTheme = theme === 'system' ? systemTheme : theme;

    return (
        <button
            onClick={() => setTheme(currentTheme === 'dark' ? 'light' : 'dark')}
            className="p-2 ml-2 rounded-lg bg-white/50 dark:bg-slate-800/50 hover:bg-white/80 dark:hover:bg-slate-700/80 border border-slate-200/50 dark:border-slate-700/50 transition-all duration-300 shadow-sm"
            aria-label="Toggle theme"
            title={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
        >
            {currentTheme === 'dark' ? (
                <Sun className="h-5 w-5 text-amber-500 hover:scale-110 transition-transform" />
            ) : (
                <Moon className="h-5 w-5 text-indigo-600 hover:scale-110 transition-transform" />
            )}
        </button>
    );
}
