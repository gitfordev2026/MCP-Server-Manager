'use client';

import React from 'react';
import { Copy, Check } from 'lucide-react';

export interface CodeBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  title?: string;
}

export function CodeBlock({ code, language, showLineNumbers = false, title, className = '', ...props }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.trim().split('\n');

  return (
    <div className={`overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] ${className}`} {...props}>
      {(title || language) && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-default)] bg-[var(--bg-elevated)]">
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {title || language}
          </span>
          <button
            onClick={handleCopy}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-[var(--transition-fast)] p-1 rounded hover:bg-[var(--bg-surface)]"
            aria-label="Copy code"
          >
            {copied ? <Check size={14} className="text-[var(--accent-success)]" /> : <Copy size={14} />}
          </button>
        </div>
      )}
      {!title && !language && (
        <div className="absolute right-2 top-2 z-10">
          <button
            onClick={handleCopy}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-[var(--transition-fast)] p-1.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-default)]"
            aria-label="Copy code"
          >
            {copied ? <Check size={14} className="text-[var(--accent-success)]" /> : <Copy size={14} />}
          </button>
        </div>
      )}
      <div className="relative overflow-x-auto p-4 text-sm font-mono text-[var(--text-primary)] leading-relaxed">
        {showLineNumbers ? (
          <div className="flex">
            <div className="pr-4 text-right select-none text-[var(--text-muted)] border-r border-[var(--border-default)] mr-4">
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <pre className="whitespace-pre">
              {code}
            </pre>
          </div>
        ) : (
          <pre className="whitespace-pre">{code}</pre>
        )}
      </div>
    </div>
  );
}
