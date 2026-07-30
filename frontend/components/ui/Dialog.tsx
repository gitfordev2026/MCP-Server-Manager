'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface DialogAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  actions?: DialogAction[];
  children?: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, description, actions, children, className = '' }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };

    if (open) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleEscape);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  const getActionClass = (variant: DialogAction['variant'] = 'secondary') => {
    switch (variant) {
      case 'primary':
        return 'bg-[var(--accent-primary)] text-white hover:opacity-90';
      case 'danger':
        return 'bg-[var(--accent-danger)] text-white hover:opacity-90';
      case 'secondary':
      default:
        return 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--bg-surface)]';
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div 
          ref={overlayRef}
          onClick={handleOverlayClick}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6"
        >
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={`w-full max-w-md bg-[var(--bg-root)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] border border-[var(--border-default)] flex flex-col ${className}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-default)]">
              <div>
                <h2 id="dialog-title" className="text-lg font-semibold text-[var(--text-primary)]">
                  {title}
                </h2>
                {description && (
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    {description}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-[var(--radius-sm)] hover:bg-[var(--bg-elevated)] transition-[var(--transition-fast)]"
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>
            
            {children && (
              <div className="p-4 overflow-y-auto">
                {children}
              </div>
            )}
            
            {actions && actions.length > 0 && (
              <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--border-default)] bg-[var(--bg-surface)] rounded-b-[var(--radius-lg)]">
                {actions.map((action, i) => (
                  <button
                    key={i}
                    onClick={action.onClick}
                    className={`px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-[var(--transition-fast)] ${getActionClass(action.variant)}`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
