'use client';

import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'purple' | 'neutral';
  size?: 'sm' | 'md';
  dot?: boolean;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = '', variant = 'neutral', size = 'sm', dot, children, ...props }, ref) => {
    const baseStyle = 'inline-flex items-center justify-center font-medium rounded-[var(--radius-sm)] border';
    
    const sizeStyles = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-2.5 py-1 text-sm',
    };
    
    const variantStyles = {
      primary: 'bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] border-[var(--accent-primary-soft)]',
      success: 'bg-[var(--accent-success-soft)] text-[var(--accent-success)] border-[var(--accent-success-soft)]',
      warning: 'bg-[var(--accent-warning-soft)] text-[var(--accent-warning)] border-[var(--accent-warning-soft)]',
      danger: 'bg-[var(--accent-danger-soft)] text-[var(--accent-danger)] border-[var(--accent-danger-soft)]',
      purple: 'bg-[var(--accent-purple-soft)] text-[var(--accent-purple)] border-[var(--accent-purple-soft)]',
      neutral: 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-default)]',
    };
    
    const dotStyles = {
      primary: 'bg-[var(--accent-primary)]',
      success: 'bg-[var(--accent-success)]',
      warning: 'bg-[var(--accent-warning)]',
      danger: 'bg-[var(--accent-danger)]',
      purple: 'bg-[var(--accent-purple)]',
      neutral: 'bg-[var(--text-muted)]',
    };

    return (
      <span
        ref={ref}
        className={`${baseStyle} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {dot && (
          <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${dotStyles[variant]}`} />
        )}
        {children}
      </span>
    );
  }
);
Badge.displayName = 'Badge';
