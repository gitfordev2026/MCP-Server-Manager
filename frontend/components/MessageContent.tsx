import React from 'react';

type Segment =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string; language: string };

function parseSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /```([\w-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'code',
      language: (match[1] || '').trim(),
      value: (match[2] || '').trim(),
    });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return segments;
}

function looksLikeJson(value: string) {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}

function formatJsonIfPossible(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function renderCodeBlock(value: string, key: string, language?: string) {
  const normalized = looksLikeJson(value) ? formatJsonIfPossible(value) : value;
  const label = language || (looksLikeJson(value) ? 'json' : '');

  return (
    <div key={key} className="my-2 rounded-xl border border-slate-300/40 dark:border-slate-700 bg-slate-950/90 overflow-hidden shadow-sm">
      {label && (
        <div className="px-3 py-1 text-[11px] font-mono uppercase tracking-wide text-slate-400 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <span>{label}</span>
        </div>
      )}
      <pre className="p-3 text-xs sm:text-sm overflow-auto whitespace-pre-wrap break-words text-slate-100 font-mono">
        <code>{normalized}</code>
      </pre>
    </div>
  );
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      const codeVal = token.slice(1, -1);
      nodes.push(
        <code
          key={match.index}
          className="bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/60 px-1.5 py-0.5 rounded-md font-mono text-xs font-semibold mx-0.5 inline-block"
        >
          {codeVal}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={match.index} className="font-bold text-slate-900 dark:text-slate-100">
          {renderInlineMarkdown(token.slice(2, -2))}
        </strong>
      );
    } else if ((token.startsWith('_') && token.endsWith('_')) || (token.startsWith('*') && token.endsWith('*'))) {
      nodes.push(
        <em key={match.index} className="italic text-slate-700 dark:text-slate-300">
          {renderInlineMarkdown(token.slice(1, -1))}
        </em>
      );
    } else {
      nodes.push(token);
    }
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }

  return nodes;
}

function renderMarkdownBlock(block: string, keyPrefix: string): React.ReactNode {
  const lines = block.split('\n');
  const elements: React.ReactNode[] = [];

  let inTable = false;
  let tableRows: string[] = [];

  const flushTable = (idx: number) => {
    if (tableRows.length === 0) return;
    const header = tableRows[0].split('|').map((s) => s.trim()).filter(Boolean);
    const bodyRows = tableRows
      .slice(1)
      .filter((row) => !row.includes('---'))
      .map((row) => row.split('|').map((s) => s.trim()).filter(Boolean));

    elements.push(
      <div key={`${keyPrefix}-table-${idx}`} className="my-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <table className="min-w-full text-xs sm:text-sm text-left">
          <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
            <tr>
              {header.map((cell, colIdx) => (
                <th key={colIdx} className="px-4 py-2.5">{renderInlineMarkdown(cell)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
            {bodyRows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="px-4 py-2 text-slate-700 dark:text-slate-300">{renderInlineMarkdown(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
    inTable = false;
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Table detection
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      tableRows.push(trimmed);
      return;
    } else if (inTable) {
      flushTable(idx);
    }

    // Horizontal Rule
    if (trimmed === '---' || trimmed === '***') {
      elements.push(<hr key={idx} className="my-3 border-slate-200 dark:border-slate-800" />);
      return;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3 key={idx} className="text-base font-bold text-slate-900 dark:text-white mt-3 mb-1.5 flex items-center gap-2">
          {renderInlineMarkdown(trimmed.slice(4))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h2 key={idx} className="text-lg font-bold text-slate-900 dark:text-white mt-4 mb-2">
          {renderInlineMarkdown(trimmed.slice(3))}
        </h2>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h1 key={idx} className="text-xl font-bold text-slate-900 dark:text-white mt-4 mb-2">
          {renderInlineMarkdown(trimmed.slice(2))}
        </h1>
      );
      return;
    }

    // Bullet List Item with Indentation
    const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const indentSpaces = listMatch[1].length;
      const contentText = listMatch[3];
      elements.push(
        <div
          key={idx}
          className="flex items-start gap-2.5 text-sm leading-relaxed my-1 text-slate-800 dark:text-slate-200"
          style={{ paddingLeft: `${Math.min(indentSpaces, 12) * 0.5}rem` }}
        >
          <span className="text-rose-500 font-bold text-xs pt-1 select-none">•</span>
          <span className="flex-1">{renderInlineMarkdown(contentText)}</span>
        </div>
      );
      return;
    }

    if (trimmed) {
      elements.push(
        <p key={idx} className="text-sm leading-relaxed my-1 text-slate-800 dark:text-slate-200">
          {renderInlineMarkdown(line)}
        </p>
      );
    }
  });

  if (inTable) {
    flushTable(lines.length);
  }

  return <div key={keyPrefix} className="space-y-1">{elements}</div>;
}

export default function MessageContent({ content }: { content: string }) {
  if (!content) return null;

  const segments = parseSegments(content);

  return (
    <div className="space-y-2">
      {segments.map((segment, index) => {
        if (segment.type === 'code') {
          return renderCodeBlock(segment.value, `code-${index}`, segment.language);
        }

        return renderMarkdownBlock(segment.value, `md-${index}`);
      })}
    </div>
  );
}
