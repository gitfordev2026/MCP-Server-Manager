'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Navigation from '@/components/Navigation';
import { publicEnv } from '@/lib/env';
import { fetchAuthConfig, type AuthConfig } from '@/lib/auth';

/**
 * MCP Inspector connection helper.
 *
 * The MCP Inspector is an external Electron-based desktop tool that
 * connects to MCP servers over the streamable-HTTP transport. This page
 * helps a developer:
 *
 *   1. Generate the proxied endpoint URL that the browser can reach.
 *      Direct hits to the backend URL would fail CORS / would not carry
 *      the HttpOnly Keycloak session cookies set by the proxy.
 *
 *   2. Read the active Keycloak access token from the backend's
 *      `access_token` cookie. Because the cookie is HttpOnly, we cannot
 *      read it from JavaScript — instead we offer a server-side
 *      `__diag/token` endpoint that returns it once for debugging /
 *      inspector use. The endpoint is gated by AUTH_ENABLED.
 *
 *   3. Copy or launch the configured Inspector connection.
 *
 * Note: the actual `mcp-session-id` flow uses the same bearer token for
 * every request — the Inspector maintains its own session id and sends it
 * via the standard `Mcp-Session-Id` header on follow-ups.
 */
export default function McpInspectorPage() {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchAuthConfig(publicEnv.NEXT_PUBLIC_BE_API_URL);
        if (!cancelled) {
          setAuthConfig(cfg);
          setAuthRequired(cfg.auth_enabled);
        }
      } catch (err) {
        if (!cancelled) setAuthRequired(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The endpoint the MCP Inspector should point at. The frontend proxy
  // at `/api/proxy/mcp/apps/` forwards to the backend's combined MCP
  // endpoint, applying the HMAC signature and forwarding cookies /
  // Authorization headers.
  const endpointUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/api/proxy/mcp/apps';
    return `${window.location.origin}/api/proxy/mcp/apps`;
  }, []);

  const fetchToken = useCallback(async () => {
    setTokenError(null);
    try {
      const res = await fetch('/api/proxy/__diag/token', {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        setTokenError(`Token endpoint returned ${res.status}: ${text || res.statusText}`);
        return;
      }
      const data = (await res.json()) as { token?: string; auth_enabled?: boolean };
      if (!data.token) {
        setTokenError('No token returned by backend. Make sure you are logged in.');
        return;
      }
      setToken(data.token);
    } catch (err: any) {
      setTokenError(err?.message || 'Could not fetch token');
    }
  }, []);

  const copy = useCallback(async (value: string, key: string) => {
    let success = false;
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(value);
        success = true;
      } catch {
        // Fallback below
      }
    }

    if (!success) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = value;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch {
        success = false;
      }
    }

    if (success) {
      setCopied(key);
      setTimeout(() => setCopied((cur) => (cur === key ? null : cur)), 1500);
    }
  }, []);

  const launchInspector = useCallback(() => {
    // The official MCP Inspector (https://github.com/modelcontextprotocol/inspector)
    // is launched as `npx @modelcontextprotocol/inspector`. We open a new
    // window pointing at its default UI on a local dev port. The user is
    // expected to paste the endpoint URL + bearer token into the form.
    // Some teams proxy the Inspector UI behind the Next.js dev server
    // instead — that path is enabled by setting
    // `NEXT_PUBLIC_MCP_INSPECTOR_URL` (e.g. http://localhost:6274).
    const inspectorOrigin =
      (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MCP_INSPECTOR_URL) ||
      'http://localhost:6274';
    window.open(inspectorOrigin, '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navigation pageTitle="MCP Inspector" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            MCP Inspector
          </h1>
          <p className="text-slate-600 dark:text-slate-300 max-w-3xl">
            Connect the official MCP Inspector to your Server Manager. The
            proxied endpoint at{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
              /api/proxy/mcp/apps/
            </code>{' '}
            forwards to the combined MCP backend with HMAC signing and your
            Keycloak session cookies attached.
          </p>
        </header>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            1. Transport
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            The combined MCP server uses the{' '}
            <span className="font-medium">Streamable HTTP</span> transport.
            In the Inspector, set:
          </p>
          <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-300 space-y-1">
            <li>
              <span className="font-medium">Transport Type</span>:{' '}
              <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800">
                Streamable HTTP
              </code>
            </li>
            <li>
              <span className="font-medium">URL</span>:
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 break-all">
                  {endpointUrl}
                </code>
                <button
                  type="button"
                  onClick={() => copy(endpointUrl, 'url')}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
                >
                  {copied === 'url' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </li>
          </ul>
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            2. Authentication
          </h2>
          {authRequired === false && (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              AUTH_ENABLED is <code>false</code> on the backend — the proxy
              will forward requests without a token. You can skip the
              bearer token field.
            </p>
          )}
          {authRequired && (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Keycloak protects the combined MCP endpoint. The frontend
                proxy will already attach the HttpOnly session cookie set
                after login, so a bearer token is only required if you run
                the Inspector outside the browser (e.g. the Electron
                client). Fetch the active access token from the backend:
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={fetchToken}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
                >
                  Fetch Active Keycloak Token
                </button>
                {token && (
                  <button
                    type="button"
                    onClick={() => copy(token, 'token')}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-700"
                  >
                    {copied === 'token' ? 'Copied' : 'Copy Token'}
                  </button>
                )}
              </div>

              {tokenError && (
                <p className="text-sm text-rose-600 dark:text-rose-400">
                  {tokenError}
                </p>
              )}

              {token && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Authorization header
                  </label>
                  <code className="block break-all px-3 py-2 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs">
                    Bearer {token}
                  </code>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Paste this value into the Inspector's{' '}
                    <span className="font-medium">Authentication → Bearer
                    Token</span> field.
                  </p>
                </div>
              )}
            </>
          )}
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            3. Launch the Inspector
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Start the MCP Inspector with{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800">
              npx @modelcontextprotocol/inspector
            </code>{' '}
            (or open the URL configured by your team) and paste the values
            above into its connection form.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={launchInspector}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Open Inspector
            </button>
            <a
              href="https://github.com/modelcontextprotocol/inspector"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-700"
            >
              Inspector Docs ↗
            </a>
          </div>
        </section>

        {authConfig && (
          <section className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-xs text-slate-600 dark:text-slate-400 space-y-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Auth configuration (read-only)
            </h3>
            <div>
              <span className="font-semibold">Keycloak URL:</span>{' '}
              {authConfig.keycloak_url}
            </div>
            <div>
              <span className="font-semibold">Realm:</span>{' '}
              {authConfig.realm}
            </div>
            <div>
              <span className="font-semibold">Client ID:</span>{' '}
              {authConfig.client_id}
            </div>
            <div>
              <span className="font-semibold">Auth Enabled:</span>{' '}
              {String(authConfig.auth_enabled)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}