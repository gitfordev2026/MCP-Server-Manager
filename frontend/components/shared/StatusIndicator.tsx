'use client';

import React from 'react';

export interface StatusIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  status: 'alive' | 'down' | 'warning' | 'neutral' | 'disabled';
  label?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  pulse?: boolean;
}

export function StatusIndicator({ 
  status, 
  label, 
  showLabel = true, 
  size = 'md', 
  pulse = false,
  className = '',
  ...props 
}: StatusIndicatorProps) {
  
  const statusColors = {
    alive: 'bg-[var(--accent-success)]',
    down: 'bg-[var(--accent-danger)]',
    warning: 'bg-[var(--accent-warning)]',
    neutral: 'bg-[var(--accent-primary)]',
    disabled: 'bg-[var(--text-muted)]',
  };

  const defaultLabels = {
    alive: 'Operational',
    down: 'Down',
    warning: 'Warning',
    neutral: 'Active',
    disabled: 'Disabled',
  };

  const displayLabel = label || defaultLabels[status];
  
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div className={`inline-flex items-center gap-2 ${className}`} {...props}>
      <div className="relative flex items-center justify-center">
        <div className={`rounded-full ${dotSize} ${statusColors[status]}`} />
        {pulse && status !== 'disabled' && (
          <div className={`absolute rounded-full ${dotSize} ${statusColors[status]} animate-ping opacity-75`} />
        )}
      </div>
      {showLabel && (
        <span className={`font-medium text-[var(--text-primary)] ${textSize}`}>
          {displayLabel}
        </span>
      )}
    </div>
  );
}
