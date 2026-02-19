import { publicEnv } from '@/lib/env';

const API_BASE = publicEnv.NEXT_PUBLIC_BE_API_URL;

if (!API_BASE) {
  throw new Error('NEXT_PUBLIC_BE_API_URL is not configured');
}

export async function http<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail =
      typeof data?.detail === 'string'
        ? data.detail
        : JSON.stringify(data?.detail ?? data);

    throw new Error(detail || `HTTP ${res.status}`);
  }

  return res.json();
}
