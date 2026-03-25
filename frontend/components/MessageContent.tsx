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

function renderTextBlock(block: string, key: string) {
  const trimmed = block.trim();
  if (!trimmed) {
    return null;
  }

  const lines = trimmed.split('\n');
  const isBulletList = lines.every((line) => /^[-*]\s+/.test(line.trim()));
  if (isBulletList) {
    return (
      <ul key={key} className="list-disc pl-5 space-y-1">
        {lines.map((line, index) => (
          <li key={`${key}-${index}`}>{line.replace(/^[-*]\s+/, '')}</li>
        ))}
      </ul>
    );
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
          return (
            <div key={`code-${index}`} className="rounded-xl border border-slate-300/40 bg-slate-950/90 overflow-hidden">
              {segment.language && (
                <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-slate-400 bg-slate-900/80 border-b border-slate-800">
                  {segment.language}
                </div>
              )}
              <pre className="p-3 text-xs sm:text-sm overflow-auto whitespace-pre-wrap break-words text-slate-100">
                <code>{segment.value}</code>
              </pre>
            </div>
          );
        }

        return segment.value
          .split(/\n{2,}/)
          .map((block, blockIndex) => renderTextBlock(block, `text-${index}-${blockIndex}`));
      })}
    </div>
  );
}
