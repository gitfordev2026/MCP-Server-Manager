import { publicEnv } from '@/lib/env';

const API_BASE = publicEnv.NEXT_PUBLIC_BE_API_URL;

if (!API_BASE) {
  throw new Error('NEXT_PUBLIC_BE_API_URL is not configured');
}

function resolveActorHeaders(): Record<string, string> {
  if (typeof window === 'undefined') {
    return { 'x-user': 'system', 'x-roles': 'super_admin' };
  }
  const storedUser = window.localStorage.getItem('mcp_admin_user') || '';
  const storedRoles = window.localStorage.getItem('mcp_admin_roles') || '';
  const user = storedUser.trim() || 'admin';
  const roles = storedRoles.trim() || 'super_admin';
  return {
    'x-user': user,
    'x-roles': roles,
  };
}

export async function http<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const actorHeaders = resolveActorHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...actorHeaders,
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
