"use client"

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  fetchAuthConfig,
  getStoredToken,
  redirectToLogin,
  refreshAccessToken,
  type AuthConfig,
} from '@/lib/auth';
import { publicEnv } from '@/lib/env';

/** Paths that should never trigger the auth guard. */
const PUBLIC_PATHS = ['/auth/callback', '/auth/register', '/login'];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [readyPath, setReadyPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [bypassAuth, setBypassAuth] = useState(false);
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const hasToken = Boolean(getStoredToken());

  useEffect(() => {
    if (isPublicPath) return;
    if (hasToken) return;

    let cancelled = false;

    (async () => {
      try {
        if (!cancelled) setError(null);
        const config: AuthConfig = await fetchAuthConfig(publicEnv.NEXT_PUBLIC_BE_API_URL);

        if (!config.auth_enabled) {
          // Auth is disabled (dev mode) - render the app directly.
          if (!cancelled) setReadyPath(pathname);
          return;
        }

        // Check for a valid stored token.
        if (getStoredToken()) {
          if (!cancelled) setReadyPath(pathname);
          return;
        }

        // Attempt a silent refresh before redirecting.
        const refreshed = await refreshAccessToken(config);
        if (refreshed && !cancelled) {
          setReadyPath(pathname);
          return;
        }

        // No valid session - redirect to Keycloak login.
        if (!cancelled) {
          await redirectToLogin(config);
        }
      } catch (err) {
        console.error('AuthGuard error:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to reach auth service');
          setReadyPath(pathname);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasToken, isPublicPath, pathname, attempt]);

  if (isPublicPath || hasToken || readyPath === pathname || bypassAuth) {
    return <>{children}</>;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full rounded-2xl border border-red-200 bg-white shadow-sm p-6 text-center">
          <h2 className="text-lg font-semibold text-red-600 mb-2">Authentication Unavailable</h2>
          <p className="text-sm text-slate-600 mb-4">
            Unable to reach the backend authentication service. Please start the backend and try again.
          </p>
          <p className="text-xs text-slate-400 mb-4 break-words">{error}</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setAttempt((v) => v + 1)}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => setBypassAuth(true)}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Continue Without Auth
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (readyPath !== pathname) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

