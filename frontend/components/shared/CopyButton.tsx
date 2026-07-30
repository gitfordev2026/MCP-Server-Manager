'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface CopyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text: string;
  size?: 'sm' | 'md';
}

export function CopyButton({ text, size = 'sm', className = '', ...props }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const iconSize = size === 'sm' ? 14 : 16;
  const padding = size === 'sm' ? 'p-1.5' : 'p-2';

  return (
    <button
      onClick={handleCopy}
      className={`relative inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] hover:border-[var(--border-strong)] transition-all duration-200 ${padding} ${className}`}
      aria-label="Copy to clipboard"
      title="Copy to clipboard"
      {...props}
    >
      <div className="relative flex items-center justify-center">
        <AnimatePresence initial={false} mode="wait">
          {copied ? (
            <motion.span
              key="check"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.15 }}
              className="text-[var(--accent-success)]"
            >
              <Check size={iconSize} />
            </motion.span>
          ) : (
            <motion.span
              key="copy"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.15 }}
            >
              <Copy size={iconSize} />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </button>
  );
}
