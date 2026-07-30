'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  fetchAuthConfig,
  exchangeCodeForToken,
  consumePostLoginRedirect,
  getStoredToken,
  storeTokens,
  clearTokens,
} from '@/lib/auth';
import { publicEnv } from '@/lib/env';
import { authenticatedFetch } from '@/services/http';

function CallbackContent() {
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

    if (exchangeStarted.current === code) return;
    exchangeStarted.current = code;

    (async () => {
      try {
        const config = await fetchAuthConfig(publicEnv.NEXT_PUBLIC_BE_API_URL);

        // 1. Exchange code if not already stored
        if (!getStoredToken()) {
          const tokenResponse = await exchangeCodeForToken(config, code);
          storeTokens(tokenResponse);
        }

        // 2. --- STRICT PRE-CHECK: Verify Maintenance Mode & DB Role ---
        let isMaintActive = false;
        try {
          const maintRes = await fetch('/api/proxy/api/system/maintenance', { cache: 'no-store' });
          if (maintRes.ok) {
            const maintData = await maintRes.json();
            isMaintActive = Boolean(maintData.enabled);
          }
        } catch (_) {}

        const meRes = await authenticatedFetch('/api/proxy/api/me');
        if (meRes.status === 403) {
          // Unregistered user / No DB role assigned -> Go straight to /access-denied
          window.location.href = '/access-denied';
          return;
        } else if (meRes.status === 401) {
          clearTokens();
          window.location.href = '/login';
          return;
        }

        if (meRes.ok) {
          const profile = await meRes.json();
          const role = profile.primary_role;
          const isAdmin = role === 'admin' || role === 'super_admin';

          if (isMaintActive && !isAdmin) {
            clearTokens();
            setError('System Maintenance Mode is currently ACTIVE. Login access is restricted to System Administrators only.');
            return;
          }
        }

        // 3. Allowed user -> Go to target destination
        const target = consumePostLoginRedirect(state);
        window.location.href = target && target !== '/' ? target : '/dashboard';
      } catch (err) {
        console.error('Auth callback error:', err);
        const message = err instanceof Error ? err.message : 'Token exchange failed';
        if (message.toLowerCase().includes('pkce verifier missing')) {
          return;
        }
        setError(message);
      }
    })();
  }, [code, router, state]);

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
        <p className="text-slate-600">Completing authentication and checking permissions...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-slate-600">Loading callback parameters...</p>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
