'use client';

import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className = '', ...props }, ref) => (
    <div className="w-full overflow-auto rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-root)]">
      <table
        ref={ref}
        className={`w-full caption-bottom text-sm ${className}`}
        {...props}
      />
    </div>
  )
);
Table.displayName = 'Table';

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className = '', ...props }, ref) => (
    <thead ref={ref} className={`[&_tr]:border-b [&_tr]:border-[var(--border-default)] bg-[var(--bg-surface)] ${className}`} {...props} />
  )
);
TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className = '', ...props }, ref) => (
    <tbody
      ref={ref}
      className={`[&_tr:last-child]:border-0 ${className}`}
      {...props}
    />
  )
);
TableBody.displayName = 'TableBody';

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className = '', ...props }, ref) => (
    <tr
      ref={ref}
      className={`border-b border-[var(--border-default)] transition-colors hover:bg-[var(--bg-surface)]/50 data-[state=selected]:bg-[var(--bg-surface)] ${className}`}
      {...props}
    />
  )
);
TableRow.displayName = 'TableRow';

export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className = '', ...props }, ref) => (
    <td
      ref={ref}
      className={`p-4 align-middle [&:has([role=checkbox])]:pr-0 text-[var(--text-primary)] ${className}`}
      {...props}
    />
  )
);
TableCell.displayName = 'TableCell';

export interface TableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortable?: boolean;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: () => void;
}

export const TableHeaderCell = React.forwardRef<HTMLTableCellElement, TableHeaderCellProps>(
  ({ className = '', sortable, sortDirection, onSort, children, ...props }, ref) => {
    return (
      <th
        ref={ref}
        className={`h-12 px-4 text-left align-middle font-medium text-[var(--text-secondary)] [&:has([role=checkbox])]:pr-0 sticky top-0 bg-[var(--bg-surface)] z-10 ${
          sortable ? 'cursor-pointer select-none hover:text-[var(--text-primary)]' : ''
        } ${className}`}
        onClick={sortable ? onSort : undefined}
        {...props}
      >
        <div className="flex items-center gap-1.5">
          {children}
          {sortable && (
            <span className="flex flex-col text-[var(--text-muted)] w-3">
              <ChevronUp 
                size={12} 
                className={`-mb-1 ${sortDirection === 'asc' ? 'text-[var(--text-primary)]' : 'opacity-50'}`} 
              />
              <ChevronDown 
                size={12} 
                className={`${sortDirection === 'desc' ? 'text-[var(--text-primary)]' : 'opacity-50'}`} 
              />
            </span>
          )}
        </div>
      </th>
    );
  }
);
TableHeaderCell.displayName = 'TableHeaderCell';
