'use client';

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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Public pages render immediately — no auth check needed.
    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
      setReady(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const config: AuthConfig = await fetchAuthConfig(
          publicEnv.NEXT_PUBLIC_BE_API_URL
        );

        if (!config.auth_enabled) {
          // Auth is disabled (dev mode) — render the app directly.
          if (!cancelled) setReady(true);
          return;
        }

        // Check for a valid stored token.
        if (getStoredToken()) {
          if (!cancelled) setReady(true);
          return;
        }

        // Attempt a silent refresh before redirecting.
        const refreshed = await refreshAccessToken(config);
        if (refreshed && !cancelled) {
          setReady(true);
          return;
        }

        // No valid session — redirect to Keycloak login.
        if (!cancelled) {
          await redirectToLogin(config);
        }
      } catch (err) {
        console.error('AuthGuard error:', err);
        // On network failure, show the app (backend may be down).
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!ready) {
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
