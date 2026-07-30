'use client';

import React, { useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

export interface SearchBarProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  shortcut?: string; // e.g., '⌘K' or '/'
}

export function SearchBar({ 
  value, 
  onChange, 
  placeholder = 'Search...', 
  shortcut, 
  className = '', 
  autoFocus = false,
  ...props 
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!shortcut) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Very basic shortcut handling - can be expanded based on need
      if (
        (shortcut.includes('⌘') && e.metaKey && e.key.toLowerCase() === shortcut.replace('⌘', '').toLowerCase()) ||
        (shortcut.includes('Ctrl') && e.ctrlKey && e.key.toLowerCase() === shortcut.replace('Ctrl+', '').toLowerCase()) ||
        (e.key === shortcut && !e.metaKey && !e.ctrlKey)
      ) {
        if (document.activeElement !== inputRef.current) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcut]);

  return (
    <div className={`relative flex items-center w-full ${className}`}>
      <div className="absolute left-3 text-[var(--text-muted)] pointer-events-none">
        <Search size={16} />
      </div>
      
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-[var(--radius-md)] pl-9 pr-10 py-2 text-sm outline-none transition-[var(--transition-fast)] focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] placeholder:text-[var(--text-muted)]"
        autoFocus={autoFocus}
        {...props}
      />
      
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          className="absolute right-2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-[var(--radius-sm)] hover:bg-[var(--bg-elevated)] transition-[var(--transition-fast)]"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      ) : shortcut ? (
        <div className="absolute right-3 hidden sm:flex items-center pointer-events-none">
          <kbd className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-[var(--radius-sm)]">
            {shortcut}
          </kbd>
        </div>
      ) : null}
    </div>
  );
}
