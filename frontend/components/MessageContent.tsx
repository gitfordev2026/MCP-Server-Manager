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
    <div key={key} className="rounded-xl border border-slate-300/40 bg-slate-950/90 overflow-hidden">
      {label && (
        <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-slate-400 bg-slate-900/80 border-b border-slate-800">
          {label}
        </div>
      )}
      <pre className="p-3 text-xs sm:text-sm overflow-auto whitespace-pre-wrap break-words text-slate-100">
        <code>{normalized}</code>
      </pre>
    </div>
  );
}

function renderList(lines: string[], key: string) {
  const isOrdered = lines.every((line) => /^\d+\.\s+/.test(line.trim()));
  const ListTag = isOrdered ? 'ol' : 'ul';

  return (
    <ListTag
      key={key}
      className={`${isOrdered ? 'list-decimal' : 'list-disc'} pl-5 space-y-1`}
    >
      {lines.map((line, index) => (
        <li key={`${key}-${index}`}>
          {line.replace(isOrdered ? /^\d+\.\s+/ : /^[-*]\s+/, '')}
        </li>
      ))}
    </ListTag>
  );
}

function renderToolSections(block: string, key: string) {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const supportedLabels = ['Tool used:', 'Tools used:', 'Arguments:', 'Result:'];
  const hasToolFormat = lines.some((line) => supportedLabels.some((label) => line.startsWith(label)));
  if (!hasToolFormat) {
    return null;
  }

  const nodes: React.ReactNode[] = [];
  let currentLabel = '';
  let currentValue: string[] = [];

  const flush = (index: number) => {
    if (!currentLabel) return;
    const value = currentValue.join('\n').trim();
    const title = currentLabel.replace(':', '');

    nodes.push(
      <div key={`${key}-${index}`} className="rounded-xl border border-slate-200/70 bg-slate-50/70 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
        {currentLabel === 'Arguments:' && value ? (
          <div className="mt-2">{renderCodeBlock(value, `${key}-${index}-code`, 'json')}</div>
        ) : (
          <div className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{value}</div>
        )}
      </div>
    );
  };

  lines.forEach((line, index) => {
    const matchedLabel = supportedLabels.find((label) => line.startsWith(label));
    if (matchedLabel) {
      flush(index);
      currentLabel = matchedLabel;
      currentValue = [line.slice(matchedLabel.length).trim()];
    } else if (currentLabel) {
      currentValue.push(line);
    }
  });

  flush(lines.length);

  return <div key={key} className="space-y-3">{nodes}</div>;
}

function renderTextBlock(block: string, key: string) {
  const trimmed = block.trim();
  if (!trimmed) {
    return null;
  }

  const toolSections = renderToolSections(trimmed, key);
  if (toolSections) {
    return toolSections;
  }

  const lines = trimmed.split('\n');
  const isBulletList = lines.every((line) => /^[-*]\s+/.test(line.trim()));
  if (isBulletList) {
    return renderList(lines, key);
  }

  const isNumberedList = lines.every((line) => /^\d+\.\s+/.test(line.trim()));
  if (isNumberedList) {
    return renderList(lines, key);
  }

  if (looksLikeJson(trimmed)) {
    return renderCodeBlock(trimmed, key, 'json');
  }

  return (
    <p key={key} className="whitespace-pre-wrap break-words">
      {trimmed}
    </p>
  );
}

export default function MessageContent({ content }: { content: string }) {
  const segments = parseSegments(content);

  return (
    <div className="space-y-3">
      {segments.map((segment, index) => {
        if (segment.type === 'code') {
          return renderCodeBlock(segment.value, `code-${index}`, segment.language);
        }

        return segment.value
          .split(/\n{2,}/)
          .map((block, blockIndex) => renderTextBlock(block, `text-${index}-${blockIndex}`));
      })}
    </div>
  );
}
