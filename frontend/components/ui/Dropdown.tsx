'use client';

import React, { useState, useRef, useEffect } from 'react';

export interface DropdownItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger';
  separator?: boolean;
}

export interface DropdownProps extends React.HTMLAttributes<HTMLDivElement> {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
}

export function Dropdown({ trigger, items, align = 'right', className = '', ...props }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div ref={dropdownRef} className={`relative inline-block text-left ${className}`} {...props}>
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>

      {isOpen && (
        <div 
          className={`absolute z-40 mt-2 w-48 rounded-[var(--radius-md)] shadow-[var(--shadow-md)] bg-[var(--bg-root)] border border-[var(--border-default)] py-1 ${
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'
          } animate-in fade-in slide-in-from-top-2 duration-150`}
          role="menu"
          aria-orientation="vertical"
        >
          {items.map((item, index) => {
            if (item.separator) {
              return <div key={index} className="my-1 border-t border-[var(--border-default)]" />;
            }

            return (
              <button
                key={index}
                onClick={() => {
                  item.onClick?.();
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-[var(--bg-surface)] transition-[var(--transition-fast)] ${
                  item.variant === 'danger' ? 'text-[var(--accent-danger)] hover:text-[var(--accent-danger)]' : 'text-[var(--text-primary)]'
                }`}
                role="menuitem"
              >
                {item.icon && <span className="flex-shrink-0 text-[var(--text-muted)]">{item.icon}</span>}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
