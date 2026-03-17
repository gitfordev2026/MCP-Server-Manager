'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  fetchAuthConfig,
  exchangeCodeForToken,
  consumePostLoginRedirect,
  getStoredToken,
  storeTokens,
} from '@/lib/auth';
import { publicEnv } from '@/lib/env';

export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const exchangeStarted = useRef<string | null>(null);
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  const state = searchParams.get('state');

  useEffect(() => {
    if (!code) {
      return;
    }

    // Guard against React Strict Mode double-invocation and duplicate code exchanges.
    if (exchangeStarted.current === code) return;
    exchangeStarted.current = code;

    (async () => {
      try {
        if (getStoredToken()) {
          router.replace(consumePostLoginRedirect(state) || '/');
          return;
        }
        const config = await fetchAuthConfig(publicEnv.NEXT_PUBLIC_BE_API_URL);
        const tokenResponse = await exchangeCodeForToken(config, code);
        storeTokens(tokenResponse);
        router.replace(consumePostLoginRedirect(state) || '/');
      } catch (err) {
        console.error('Auth callback error:', err);
        const message = err instanceof Error ? err.message : 'Token exchange failed';
        if (message.toLowerCase().includes('pkce verifier missing')) {
          return;
        }
        setError(message);
      }
    })();
  }, [code, router]);

  if (errorParam) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-red-600 mb-2">Authentication Error</h1>
          <p className="text-slate-600 mb-4">{errorDescription || errorParam}</p>
          <Link
            href="/login"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Return to Login
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-red-600 mb-2">Authentication Error</h1>
          <p className="text-slate-600 mb-4">{error}</p>
          <Link
            href="/login"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Return to Login
          </Link>
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
