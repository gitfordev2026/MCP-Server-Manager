'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  fetchAuthConfig,
  exchangeCodeForToken,
  consumePostLoginRedirect,
  storeTokens,
} from '@/lib/auth';
import { publicEnv } from '@/lib/env';

export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const exchangeStarted = useRef(false);

  useEffect(() => {
    // Guard against React Strict Mode double-invocation:
    // the first run removes the PKCE verifier from sessionStorage,
    // so the second run would fail.
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    if (!code) {
      setError('No authorization code received from Keycloak.');
      return;
    }

    (async () => {
      try {
        const config = await fetchAuthConfig(publicEnv.NEXT_PUBLIC_BE_API_URL);
        const tokenResponse = await exchangeCodeForToken(config, code);
        storeTokens(tokenResponse);
        const nextPath = consumePostLoginRedirect(state) || '/';
        router.replace(nextPath);
      } catch (err) {
        console.error('Auth callback error:', err);
        setError(err instanceof Error ? err.message : 'Token exchange failed');
      }
    })();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-red-600 mb-2">Authentication Error</h1>
          <p className="text-slate-600 mb-4">{error}</p>
          <a
            href="/login"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Return to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
        <p className="text-slate-600">Completing authentication...</p>
      </div>
    </div>
  );
}
