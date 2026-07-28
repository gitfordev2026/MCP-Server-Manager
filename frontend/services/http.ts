import { publicEnv } from '@/lib/env';
import { clearTokens, storePostLoginRedirect } from '@/lib/auth';

// Use the local Next.js proxy for all API requests to ensure HMAC signing
const API_BASE = '/api/proxy';

/**
 * Drop-in replacement for `fetch()` that sends credentials (HttpOnly cookies).
 *
 * The auth system uses HttpOnly cookies set by the backend `/auth/token` proxy.
 * We do NOT inject any Authorization header — the real JWT lives in the
 * `access_token` HttpOnly cookie, which `credentials: 'include'` attaches
 * automatically on same-origin requests.
 */
export async function authenticatedFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const existingHeaders = init?.headers || {};
  const res = await fetch(input, {
    credentials: 'include',
    ...init,
    headers: {
      ...(existingHeaders as Record<string, string>),
    },
  });

  if (res.status === 401 && typeof window !== 'undefined') {
    const currentPath = window.location.pathname;
    if (
      currentPath !== '/' &&
      !currentPath.startsWith('/login') &&
      !currentPath.startsWith('/auth/') &&
      !currentPath.startsWith('/access-denied')
    ) {
      clearTokens();
      storePostLoginRedirect(
        `${window.location.pathname}${window.location.search}${window.location.hash}`
      );
      window.location.href = '/';
    }
  }

  return res;
}

export async function http<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (res.status === 401 && typeof window !== 'undefined') {
    const currentPath = window.location.pathname;
    if (
      currentPath !== '/' &&
      !currentPath.startsWith('/login') &&
      !currentPath.startsWith('/auth/') &&
      !currentPath.startsWith('/access-denied')
    ) {
      clearTokens();
      storePostLoginRedirect(
        `${window.location.pathname}${window.location.search}${window.location.hash}`
      );
      window.location.href = '/';
    }
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
