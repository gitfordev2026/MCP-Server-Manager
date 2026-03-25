import { getStoredToken } from '@/lib/auth';

type StreamEvent =
  | { type: 'start' }
  | { type: 'meta'; mode?: string; status?: string }
  | { type: 'chunk'; content?: string }
  | { type: 'end'; mode?: string }
  | { type: 'error'; detail?: string; status?: number };

type StreamOptions = {
  url: string;
  body: object;
  onChunk: (chunk: string) => void;
  onMeta?: (event: Extract<StreamEvent, { type: 'meta' }>) => void;
};

function resolveHeaders(): Record<string, string> {
  if (typeof window === 'undefined') {
    return { 'Content-Type': 'application/json' };
  }

  const token = getStoredToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function streamAgentResponse({
  url,
  body,
  onChunk,
  onMeta,
}: StreamOptions): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
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

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line) {
        const event = JSON.parse(line) as StreamEvent;
        if (event.type === 'chunk' && event.content) {
          onChunk(event.content);
        } else if (event.type === 'meta') {
          onMeta?.(event);
        } else if (event.type === 'error') {
          throw new Error(event.detail || 'Streaming request failed');
        }
      }

      newlineIndex = buffer.indexOf('\n');
    }

    if (done) {
      const finalLine = buffer.trim();
      if (finalLine) {
        const event = JSON.parse(finalLine) as StreamEvent;
        if (event.type === 'chunk' && event.content) {
          onChunk(event.content);
        } else if (event.type === 'meta') {
          onMeta?.(event);
        } else if (event.type === 'error') {
          throw new Error(event.detail || 'Streaming request failed');
        }
      }
      break;
    }
  }
}
