import { getStoredToken } from '@/lib/auth';

type StreamEvent =
  | { type: 'start' }
  | { type: 'meta'; mode?: string; status?: string }
  | { type: 'chunk'; content?: string }
  | { type: 'replace'; content?: string }
  | { type: 'end'; mode?: string }
  | { type: 'error'; detail?: string; status?: number };

type StreamOptions = {
  url: string;
  body: object;
  onChunk: (chunk: string) => void;
  onReplace?: (content: string) => void;
  onMeta?: (event: Extract<StreamEvent, { type: 'meta' }>) => void;
};

function resolveHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

export async function streamAgentResponse({
  url,
  body,
  onChunk,
  onReplace,
  onMeta,
}: StreamOptions): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/x-ndjson',
      ...resolveHeaders(),
    },
    cache: 'no-store',
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.detail || `HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Streaming is not supported by this browser response.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleEvent = (event: StreamEvent) => {
    if (event.type === 'chunk' && event.content) {
      onChunk(event.content);
    } else if (event.type === 'replace' && event.content) {
      if (onReplace) {
        onReplace(event.content);
      } else {
        onChunk(event.content);
      }
    } else if (event.type === 'meta') {
      onMeta?.(event);
    } else if (event.type === 'error') {
      throw new Error(event.detail || 'Streaming request failed');
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line) {
        handleEvent(JSON.parse(line) as StreamEvent);
      }

      newlineIndex = buffer.indexOf('\n');
    }

    if (done) {
      const finalLine = buffer.trim();
      if (finalLine) {
        handleEvent(JSON.parse(finalLine) as StreamEvent);
      }
      break;
    }
  }
}
