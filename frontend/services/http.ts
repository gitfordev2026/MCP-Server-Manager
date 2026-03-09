import { publicEnv } from '@/lib/env';
import { getStoredToken, clearTokens } from '@/lib/auth';

const API_BASE = publicEnv.NEXT_PUBLIC_BE_API_URL;

if (!API_BASE) {
  throw new Error('NEXT_PUBLIC_BE_API_URL is not configured');
}

export function resolveAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }
  const token = getStoredToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

/**
 * Drop-in replacement for `fetch()` that injects the JWT Authorization header.
 * Use this wherever raw `fetch()` is used to call the backend API.
 */
export function authenticatedFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const authHeaders = resolveAuthHeaders();
  const existingHeaders = init?.headers || {};
  return fetch(input, {
    ...init,
    headers: {
      ...authHeaders,
      ...(existingHeaders as Record<string, string>),
    },
  });
}

export async function http<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const authHeaders = resolveAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(options.headers || {}),
    },
    ...options,
  });

  if (res.status === 401 && typeof window !== 'undefined') {
    clearTokens();
    window.location.href = '/login';
    throw new Error('Authentication expired — redirecting to login');
  }

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
