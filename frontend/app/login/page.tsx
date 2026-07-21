'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import {
  fetchAuthConfig,
  redirectToLogin,
  getStoredToken,
  type AuthConfig,
} from '@/lib/auth';
import { publicEnv } from '@/lib/env';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [authDisabled, setAuthDisabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const config: AuthConfig = await fetchAuthConfig(
          publicEnv.NEXT_PUBLIC_BE_API_URL
        );

        if (!config.auth_enabled) {
          if (!cancelled) setAuthDisabled(true);
          return;
        }

        // If user already has a valid token, send home.
        if (getStoredToken()) {
          window.location.href = '/';
          return;
        }

        // Redirect to Keycloak login.
        if (!cancelled) {
          await redirectToLogin(config);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to start login');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (authDisabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-slate-50 to-slate-100">
        <Card className="bg-white/70 backdrop-blur-xl border border-slate-200/60 p-8 text-center max-w-md">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Authentication Disabled
          </h1>
          <p className="text-slate-600 mb-6">
            Authentication is not enabled on this instance. You can access the
            dashboard directly.
          </p>
          <Link
            href="/"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Go to Dashboard
          </Link>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-slate-50 to-slate-100">
        <Card className="bg-white/70 backdrop-blur-xl border border-slate-200/60 p-8 text-center max-w-md">
          <h1 className="text-xl font-bold text-red-600 mb-2">Login Error</h1>
          <p className="text-slate-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Retry
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
        <p className="text-slate-600">Redirecting to login...</p>
      </div>
    </div>
  );
}
