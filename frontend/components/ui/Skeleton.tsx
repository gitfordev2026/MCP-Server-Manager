'use client';

import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  animate?: boolean;
}

export function Skeleton({ className = '', width, height, animate = true, style, ...props }: SkeletonProps) {
  return (
    <div
      className={`bg-[var(--bg-elevated)] rounded-[var(--radius-sm)] ${animate ? 'animate-pulse' : ''} ${className}`}
      style={{ width, height, ...style }}
      {...props}
    />
  );
}

export interface SkeletonTextProps extends SkeletonProps {
  lines?: number;
}

export function SkeletonText({ lines = 3, className = '', ...props }: SkeletonTextProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="1rem"
          width={i === lines - 1 ? '70%' : '100%'}
          {...props}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '', ...props }: SkeletonProps) {
  return (
    <div className={`p-4 border border-[var(--border-default)] rounded-[var(--radius-md)] bg-[var(--bg-surface)] ${className}`}>
      <Skeleton width="40%" height="1.5rem" className="mb-4" {...props} />
      <SkeletonText lines={3} className="mb-4" {...props} />
      <Skeleton width="20%" height="2rem" {...props} />
    </div>
  );
}
