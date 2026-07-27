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
  const [loading, setLoading] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [authDisabled, setAuthDisabled] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const config: AuthConfig = await fetchAuthConfig(
          publicEnv.NEXT_PUBLIC_BE_API_URL
        );
        setAuthConfig(config);

        if (!config.auth_enabled) {
          setAuthDisabled(true);
          return;
        }

        // If user already authenticated, redirect to dashboard
        if (getStoredToken()) {
          window.location.href = '/dashboard';
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch auth configuration');
      }
    })();
  }, []);

  const handleSignIn = async () => {
    if (!authConfig) return;
    setLoading(true);
    setError(null);
    try {
      await redirectToLogin(authConfig);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Failed to start login flow');
    }
  };

  if (authDisabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4">
        <Card className="bg-slate-900 border border-slate-800 p-8 text-center max-w-md w-full rounded-2xl shadow-2xl">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-4 font-bold text-xl">
            M
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-2">
            Authentication Disabled
          </h1>
          <p className="text-slate-400 text-sm mb-6">
            Authentication is disabled on this server instance. You can access the application control plane directly.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex w-full items-center justify-center bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-blue-600/20"
          >
            Go to Dashboard →
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />

      <Card className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 p-8 text-center max-w-md w-full rounded-3xl shadow-2xl relative z-10">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center mx-auto mb-6 text-white font-extrabold text-2xl shadow-lg shadow-indigo-500/30">
          M
        </div>

        <h1 className="text-2xl font-extrabold text-white mb-2">
          MCP Server Manager
        </h1>
        <p className="text-slate-400 text-sm mb-8">
          Enterprise API Gateway & Keycloak OAuth2 Control Plane
        </p>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs text-left">
            <span className="font-semibold block mb-1">Authentication Error:</span>
            {error}
          </div>
        )}

        <button
          onClick={handleSignIn}
          disabled={loading || !authConfig}
          className="w-full inline-flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white px-6 py-3.5 rounded-xl font-bold text-sm transition-all shadow-xl shadow-indigo-600/25 cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Redirecting to Keycloak...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 text-indigo-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              <span>Sign In with Keycloak SSO</span>
            </>
          )}
        </button>

        <div className="mt-8 pt-6 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>Protected Route</span>
          <span>Keycloak OIDC PKCE</span>
        </div>
      </Card>
    </div>
  );
}
