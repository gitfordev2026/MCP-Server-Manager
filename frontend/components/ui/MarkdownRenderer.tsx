'use client';

import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  if (!content) return null;

  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeLang = '';
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = (keyPrefix: string) => {
    if (listItems.length > 0 && listType) {
      if (listType === 'ul') {
        blocks.push(
          <ul key={`ul-${keyPrefix}-${blocks.length}`} className="list-disc list-inside space-y-1.5 my-3 text-slate-700 dark:text-slate-300">
            {listItems.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {renderInlineMarkdown(item)}
              </li>
            ))}
          </ul>
        );
      } else {
        blocks.push(
          <ol key={`ol-${keyPrefix}-${blocks.length}`} className="list-decimal list-inside space-y-1.5 my-3 text-slate-700 dark:text-slate-300">
            {listItems.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {renderInlineMarkdown(item)}
              </li>
            ))}
          </ol>
        );
      }
      listItems = [];
      listType = null;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushList(`line-${index}`);
      if (inCodeBlock) {
        blocks.push(
          <div key={`codeblock-${index}`} className="my-4 rounded-xl border border-slate-800 bg-slate-950 text-slate-100 overflow-hidden text-xs shadow-md">
            {codeLang && (
              <div className="px-4 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider font-semibold">
                {codeLang}
              </div>
            )}
            <pre className="p-4 overflow-x-auto font-mono text-xs leading-relaxed text-slate-200">
              <code>{codeBlockLines.join('\n')}</code>
            </pre>
          </div>
        );
        inCodeBlock = false;
        codeBlockLines = [];
        codeLang = '';
      } else {
        inCodeBlock = true;
        codeLang = trimmed.slice(3).trim();
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      return;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (listType !== 'ul') flushList(`line-${index}`);
      listType = 'ul';
      listItems.push(trimmed.slice(2));
      return;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.*)/);
    if (olMatch) {
      if (listType !== 'ol') flushList(`line-${index}`);
      listType = 'ol';
      listItems.push(olMatch[1]);
      return;
    }

    flushList(`line-${index}`);

    if (!trimmed) {
      return;
    }

    if (trimmed.startsWith('#### ')) {
      blocks.push(
        <h4 key={`h4-${index}`} className="text-base font-bold text-slate-900 dark:text-slate-100 mt-5 mb-2">
          {renderInlineMarkdown(trimmed.slice(5))}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h3 key={`h3-${index}`} className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent mt-6 mb-2">
          {renderInlineMarkdown(trimmed.slice(4))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h2 key={`h2-${index}`} className="text-xl font-extrabold text-slate-900 dark:text-white mt-6 mb-3 border-b border-slate-200 dark:border-slate-800 pb-1.5">
          {renderInlineMarkdown(trimmed.slice(3))}
        </h2>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      blocks.push(
        <h1 key={`h1-${index}`} className="text-2xl font-extrabold text-slate-900 dark:text-white mt-6 mb-3">
          {renderInlineMarkdown(trimmed.slice(2))}
        </h1>
      );
      return;
    }

    if (trimmed.startsWith('> ')) {
      blocks.push(
        <blockquote key={`quote-${index}`} className="my-3 pl-4 border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 py-2 pr-3 rounded-r-xl text-slate-700 dark:text-slate-300 text-sm italic">
          {renderInlineMarkdown(trimmed.slice(2))}
        </blockquote>
      );
      return;
    }

    blocks.push(
      <p key={`p-${index}`} className="my-2 leading-relaxed text-slate-700 dark:text-slate-300 text-sm">
        {renderInlineMarkdown(line)}
      </p>
    );
  });

  flushList('end');

  return <div className={`markdown-body ${className}`}>{blocks}</div>;
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining) {
    const codeMatch = remaining.match(/`([^`]+)`/);
    const boldMatch = remaining.match(/(\*\*|__)(.*?)\1/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    const matches = [
      codeMatch ? { type: 'code', index: codeMatch.index!, length: codeMatch[0].length, content: codeMatch[1] } : null,
      boldMatch ? { type: 'bold', index: boldMatch.index!, length: boldMatch[0].length, content: boldMatch[2] } : null,
      linkMatch ? { type: 'link', index: linkMatch.index!, length: linkMatch[0].length, label: linkMatch[1], url: linkMatch[2] } : null,
    ]
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => a.index - b.index);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0];
    if (first.index > 0) {
      parts.push(remaining.slice(0, first.index));
    }

    if (first.type === 'code') {
      parts.push(
        <code key={`code-${keyIdx++}`} className="px-1.5 py-0.5 rounded-md font-mono text-xs bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700/60 font-semibold">
          {first.content}
        </code>
      );
    } else if (first.type === 'bold') {
      parts.push(
        <strong key={`bold-${keyIdx++}`} className="font-bold text-slate-900 dark:text-white">
          {first.content}
        </strong>
      );
    } else if (first.type === 'link') {
      parts.push(
        <a
          key={`link-${keyIdx++}`}
          href={first.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
        >
          {first.label}
        </a>
      );
    }

    remaining = remaining.slice(first.index + first.length);
  }

  return parts;
}
