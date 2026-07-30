'use client';

import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, hint, leftIcon, rightIcon, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    
    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[var(--text-primary)]">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-[var(--text-muted)] flex items-center justify-center">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border ${
              error ? 'border-[var(--accent-danger)] focus:border-[var(--accent-danger)] focus:ring-1 focus:ring-[var(--accent-danger)]' : 'border-[var(--border-default)] focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]'
            } rounded-[var(--radius-md)] px-3 py-2 text-sm outline-none transition-[var(--transition-fast)] ${
              leftIcon ? 'pl-9' : ''
            } ${rightIcon ? 'pr-9' : ''} disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-[var(--text-muted)]`}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 text-[var(--text-muted)] flex items-center justify-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <span id={`${inputId}-error`} className="text-xs text-[var(--accent-danger)]">
            {error}
          </span>
        )}
        {!error && hint && (
          <span id={`${inputId}-hint`} className="text-xs text-[var(--text-muted)]">
            {hint}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
