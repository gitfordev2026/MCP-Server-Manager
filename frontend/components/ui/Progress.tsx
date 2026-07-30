'use client';

import React from 'react';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0-100
  label?: string;
  variant?: 'primary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  showPercentage?: boolean;
}

export function Progress({ 
  value, 
  label, 
  variant = 'primary', 
  size = 'md', 
  showPercentage = false,
  className = '',
  ...props 
}: ProgressProps) {
  const normalizedValue = Math.min(100, Math.max(0, value));
  
  const sizeStyles = {
    sm: 'h-1.5',
    md: 'h-2.5',
  };
  
  const variantStyles = {
    primary: 'bg-[var(--accent-primary)]',
    success: 'bg-[var(--accent-success)]',
    warning: 'bg-[var(--accent-warning)]',
    danger: 'bg-[var(--accent-danger)]',
  };

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`} {...props}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between text-sm font-medium text-[var(--text-primary)]">
          {label && <span>{label}</span>}
          {showPercentage && <span className="text-[var(--text-secondary)]">{Math.round(normalizedValue)}%</span>}
        </div>
      )}
      <div className={`w-full bg-[var(--bg-elevated)] rounded-full overflow-hidden ${sizeStyles[size]}`}>
        <div 
          className={`h-full transition-all duration-300 ease-in-out ${variantStyles[variant]}`}
          style={{ width: `${normalizedValue}%` }}
          role="progressbar"
          aria-valuenow={normalizedValue}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
