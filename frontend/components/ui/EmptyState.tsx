'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action, className = '', ...props }: EmptyStateProps) {
  return (
    <div 
      className={`flex flex-col items-center justify-center p-8 text-center border border-dashed border-[var(--border-default)] rounded-[var(--radius-lg)] bg-[var(--bg-surface)] ${className}`}
      {...props}
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)] mb-4">
        <Icon size={24} />
      </div>
      <h3 className="text-lg font-medium text-[var(--text-primary)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--text-secondary)] max-w-sm mb-6">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent-primary)] rounded-[var(--radius-md)] hover:bg-opacity-90 transition-[var(--transition-fast)]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
