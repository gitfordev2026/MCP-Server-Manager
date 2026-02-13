'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Navigation from '@/components/Navigation';


const NEXT_PUBLIC_BE_API_URL = process.env.NEXT_PUBLIC_BE_API_URL
const STATUS_POLL_MS = 10000;
const DOWN_AFTER_FAILURES = 2;

interface Server {
  name: string;
  url: string;
}

interface BaseURL {
  name: string;
  url: string;
  openapi_path?: string;
  include_unreachable_tools?: boolean;
}

interface ServerHealth {
  name: string;
  url: string;
  status: 'alive' | 'down';
  latency_ms: number;
  tool_count: number;
  error: string | null;
}

interface ServerStatusResponse {
  servers: ServerHealth[];
  summary: {
    total: number;
    alive: number;
    down: number;
  };
}

interface AppHealth {
  name: string;
  url: string;
  status: 'alive' | 'down';
  latency_ms: number;
  endpoint_count: number;
  error: string | null;
}

export default function Home() {
  const [servers, setServers] = useState<Server[]>([]);
  const [apps, setApps] = useState<BaseURL[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [serverHealth, setServerHealth] = useState<Record<string, ServerHealth>>({});
  const [statusSummary, setStatusSummary] = useState({ total: 0, alive: 0, down: 0 });
  const [appHealth, setAppHealth] = useState<Record<string, AppHealth>>({});
  const [appStatusSummary, setAppStatusSummary] = useState({ total: 0, alive: 0, down: 0 });
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const serversRef = useRef<Server[]>([]);
  const appsRef = useRef<BaseURL[]>([]);
  const serverHealthRef = useRef<Record<string, ServerHealth>>({});
  const appHealthRef = useRef<Record<string, AppHealth>>({});
  const pollInFlightRef = useRef(false);
  const serverFailureStreakRef = useRef<Record<string, number>>({});
  const appFailureStreakRef = useRef<Record<string, number>>({});

  const aliveLatencies = Object.values(serverHealth)
    .filter((item) => item.status === 'alive')
    .map((item) => item.latency_ms);
  const averageLatency = aliveLatencies.length
    ? Math.round(aliveLatencies.reduce((acc, value) => acc + value, 0) / aliveLatencies.length)
    : null;

  const normalizeOpenApiUrl = useCallback((baseUrl: string, openApiPath?: string) => {
    const customPath = (openApiPath || '').trim();
    if (!customPath) {
      return baseUrl.endsWith('/') ? `${baseUrl}openapi.json` : `${baseUrl}/openapi.json`;
    }
    if (customPath.startsWith('http://') || customPath.startsWith('https://')) {
      return customPath;
    }

    const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    if (customPath.startsWith('/')) {
      try {
        const parsed = new URL(trimmedBase);
        return `${parsed.protocol}//${parsed.host}${customPath}`;
      } catch {
        return `${trimmedBase}${customPath}`;
      }
    }

    return `${trimmedBase}/${customPath}`;
  }, []);

  const buildOpenApiProxyUrl = useCallback(
    (baseUrl: string, openApiPath?: string) => {
      const params = new URLSearchParams({ url: baseUrl });
      const customPath = (openApiPath || '').trim();
      if (customPath) {
        params.set('openapi_path', customPath);
      }
      return `${NEXT_PUBLIC_BE_API_URL}/openapi-spec?${params.toString()}`;
    },
    []
  );

  const countOpenApiOperations = useCallback((spec: unknown): number => {
    if (!spec || typeof spec !== 'object') return 0;
    const paths = (spec as { paths?: Record<string, unknown> }).paths;
    if (!paths || typeof paths !== 'object') return 0;

    const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
    return Object.values(paths).reduce((total, pathItem) => {
      if (!pathItem || typeof pathItem !== 'object') return total;
      const operationCount = Object.keys(pathItem as Record<string, unknown>).filter((method) =>
        methods.has(method.toLowerCase())
      ).length;
      return total + operationCount;
    }, 0);
  }, []);

  const probeAppHealth = useCallback(async (app: BaseURL): Promise<AppHealth> => {
    const openApiProxyUrl = buildOpenApiProxyUrl(app.url, app.openapi_path);
    const started = performance.now();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(openApiProxyUrl, { signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) {
        const detail =
          payload && typeof payload === 'object' && 'detail' in payload
            ? String(payload.detail)
            : `HTTP ${response.status}`;
        throw new Error(detail);
      }

      const latency = Math.round(performance.now() - started);
      const endpointCount = countOpenApiOperations(payload);

      return {
        name: app.name,
        url: app.url,
        status: 'alive',
        latency_ms: latency,
        endpoint_count: endpointCount,
        error: null,
      };
    } catch (err) {
      const latency = Math.round(performance.now() - started);
      return {
        name: app.name,
        url: app.url,
        status: 'down',
        latency_ms: latency,
        endpoint_count: 0,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [buildOpenApiProxyUrl, countOpenApiOperations]);

  const summarizeServers = useCallback(
    (serverList: Server[], healthByName: Record<string, ServerHealth>) => {
      const alive = serverList.filter((server) => healthByName[server.name]?.status === 'alive').length;
      return { total: serverList.length, alive, down: serverList.length - alive };
    },
    []
  );

  const summarizeApps = useCallback((appList: BaseURL[], healthByName: Record<string, AppHealth>) => {
    const alive = appList.filter((app) => healthByName[app.name]?.status === 'alive').length;
    return { total: appList.length, alive, down: appList.length - alive };
  }, []);

  const mergeServerHealth = useCallback(
    (
      previous: Record<string, ServerHealth>,
      incoming: ServerHealth[],
      serverList: Server[],
    ): Record<string, ServerHealth> => {
      const next: Record<string, ServerHealth> = {};
      const serverNames = new Set(serverList.map((server) => server.name));
      const incomingByName = incoming.reduce<Record<string, ServerHealth>>((acc, item) => {
        acc[item.name] = item;
        return acc;
      }, {});

      for (const serverName of serverNames) {
        const probe = incomingByName[serverName];
        const previousItem = previous[serverName];

        if (!probe) {
          if (previousItem) {
            next[serverName] = previousItem;
          }
          continue;
        }

        if (probe.status === 'alive') {
          serverFailureStreakRef.current[serverName] = 0;
          next[serverName] = probe;
          continue;
        }

        const streak = (serverFailureStreakRef.current[serverName] || 0) + 1;
        serverFailureStreakRef.current[serverName] = streak;

        if (previousItem && previousItem.status === 'alive' && streak < DOWN_AFTER_FAILURES) {
          next[serverName] = {
            ...previousItem,
            latency_ms: probe.latency_ms,
            error: probe.error,
          };
        } else {
          next[serverName] = probe;
        }
      }

      for (const trackedName of Object.keys(serverFailureStreakRef.current)) {
        if (!serverNames.has(trackedName)) {
          delete serverFailureStreakRef.current[trackedName];
        }
      }

      return next;
    },
    []
  );

  const mergeAppHealth = useCallback(
    (
      previous: Record<string, AppHealth>,
      incoming: AppHealth[],
      appList: BaseURL[],
    ): Record<string, AppHealth> => {
      const next: Record<string, AppHealth> = {};
      const appNames = new Set(appList.map((app) => app.name));
      const incomingByName = incoming.reduce<Record<string, AppHealth>>((acc, item) => {
        acc[item.name] = item;
        return acc;
      }, {});

      for (const appName of appNames) {
        const probe = incomingByName[appName];
        const previousItem = previous[appName];

        if (!probe) {
          if (previousItem) {
            next[appName] = previousItem;
          }
          continue;
        }

        if (probe.status === 'alive') {
          appFailureStreakRef.current[appName] = 0;
          next[appName] = probe;
          continue;
        }

        const streak = (appFailureStreakRef.current[appName] || 0) + 1;
        appFailureStreakRef.current[appName] = streak;

        if (previousItem && previousItem.status === 'alive' && streak < DOWN_AFTER_FAILURES) {
          next[appName] = {
            ...previousItem,
            latency_ms: probe.latency_ms,
            error: probe.error,
          };
        } else {
          next[appName] = probe;
        }
      }

      for (const trackedName of Object.keys(appFailureStreakRef.current)) {
        if (!appNames.has(trackedName)) {
          delete appFailureStreakRef.current[trackedName];
        }
      }

      return next;
    },
    []
  );

  useEffect(() => {
    const fetchData = async (silent = false) => {
      if (silent && pollInFlightRef.current) {
        return;
      }

      pollInFlightRef.current = true;
      try {
        if (!NEXT_PUBLIC_BE_API_URL) {
          setError('Backend API URL is not configured (NEXT_PUBLIC_BE_API_URL)');
          setServers([]);
          setApps([]);
          return;
        }

        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        const [serversRes, appsRes] = await Promise.allSettled([
          fetch(`${NEXT_PUBLIC_BE_API_URL}/servers`),
          fetch(`${NEXT_PUBLIC_BE_API_URL}/base-urls`),
        ]);

        let nextServers: Server[] = [];
        let nextApps: BaseURL[] = [];
        let hasServersList = false;
        let hasAppsList = false;
        const warnings: string[] = [];

        if (serversRes.status === 'fulfilled' && serversRes.value.ok) {
          const serversData = await serversRes.value.json();
          nextServers = serversData.servers || [];
          hasServersList = true;
        } else {
          warnings.push('servers');
        }

        if (appsRes.status === 'fulfilled' && appsRes.value.ok) {
          const appsData = await appsRes.value.json();
          nextApps = appsData.base_urls || [];
          hasAppsList = true;
        } else {
          warnings.push('apps');
        }

        if (hasServersList) {
          serversRef.current = nextServers;
          setServers(nextServers);
        }
        if (hasAppsList) {
          appsRef.current = nextApps;
          setApps(nextApps);
        }

        const activeServers = hasServersList ? nextServers : serversRef.current;
        const activeApps = hasAppsList ? nextApps : appsRef.current;

        // Keep last known status/count values visible while revalidating.
        setStatusSummary(summarizeServers(activeServers, serverHealthRef.current));
        setAppStatusSummary(summarizeApps(activeApps, appHealthRef.current));

        if (!silent) {
          setLoading(false);
        }

        const statusTask = fetch(`${NEXT_PUBLIC_BE_API_URL}/servers/status`).then(async (res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return (await res.json()) as ServerStatusResponse;
        });
        const appHealthTask = Promise.all(activeApps.map((app) => probeAppHealth(app)));
        const [statusResult, appHealthResult] = await Promise.allSettled([statusTask, appHealthTask]);

        if (statusResult.status === 'fulfilled') {
          const mergedServerHealth = mergeServerHealth(
            serverHealthRef.current,
            statusResult.value.servers || [],
            activeServers
          );
          serverHealthRef.current = mergedServerHealth;
          setServerHealth(mergedServerHealth);
          setStatusSummary(summarizeServers(activeServers, mergedServerHealth));
        } else {
          warnings.push('status');
        }

        if (appHealthResult.status === 'fulfilled') {
          const mergedAppHealth = mergeAppHealth(appHealthRef.current, appHealthResult.value, activeApps);
          appHealthRef.current = mergedAppHealth;
          setAppHealth(mergedAppHealth);
          setAppStatusSummary(summarizeApps(activeApps, mergedAppHealth));
        } else {
          warnings.push('app-health');
        }

        setLastUpdated(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );

        const listFetchFailed = warnings.includes('servers') && warnings.includes('apps');
        if (listFetchFailed) {
          setError('Failed to load servers and apps');
        } else {
          setError(null);
        }
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Failed to load data');
        }
        console.error('Error fetching data:', err);
      } finally {
        pollInFlightRef.current = false;
        if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    };

    void fetchData();
    const intervalId = window.setInterval(() => {
      void fetchData(true);
    }, STATUS_POLL_MS);

    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDark(true);
    }

    return () => {
      window.clearInterval(intervalId);
    };
  }, [mergeAppHealth, mergeServerHealth, probeAppHealth, summarizeApps, summarizeServers]);

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' : 'bg-gradient-to-br from-white via-slate-50 to-slate-100'} overflow-hidden transition-colors duration-500`}>
      {/* Elegant background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {isDark ? (
          <>
            <div className="absolute top-20 left-10 w-80 h-80 bg-amber-600/15 rounded-full blur-3xl animate-float"></div>
            <div className="absolute bottom-20 right-10 w-80 h-80 bg-emerald-600/15 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
            <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
          </>
        ) : (
          <>
            <div className="absolute top-20 left-10 w-80 h-80 bg-amber-400/8 rounded-full blur-3xl animate-float"></div>
            <div className="absolute bottom-20 right-10 w-80 h-80 bg-emerald-400/8 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
            <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-blue-400/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
          </>
        )}
      </div>

      {/* Navigation */}
      <Navigation isDark={isDark} />

      {/* Main Content */}
      <main className="pt-24 pb-20 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero Section */}
          <div className="text-center mb-20 animate-slideInUp">
            <h1 className={`text-6xl md:text-7xl font-bold mb-4 transition-colors duration-500 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              Server Management
            </h1>
            <p className={`text-lg mb-2 max-w-2xl mx-auto font-normal transition-colors duration-500 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Centralized control for all your MCP servers
            </p>
            <p className={`text-sm max-w-2xl mx-auto transition-colors duration-500 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Monitor performance, manage configurations, and scale with confidence
            </p>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
            {/* Active Servers Card */}
            <div className="group relative animate-slideInUp" style={{ animationDelay: '0.1s' }}>
              <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-amber-300 rounded-xl blur-lg opacity-0 group-hover:opacity-20 transition-opacity duration-500"></div>
              <div className={`relative border rounded-xl p-8 hover:border-slate-300/80 transition-all duration-300 shadow-sm hover:shadow-lg hover:-translate-y-1 ${isDark ? 'bg-slate-800 border-slate-700/80 hover:border-slate-600/80' : 'bg-white border-slate-200/80'}`}>
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <p className={`text-xs font-semibold uppercase tracking-wider transition-colors duration-500 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Active Servers</p>
                    <h3 className={`text-5xl font-bold mt-3 group-hover:text-amber-600 transition-colors duration-300 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                      {statusSummary.alive}
                    </h3>
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center border transition-all duration-300 ${isDark ? 'bg-slate-700 border-slate-600 group-hover:bg-amber-900/20 group-hover:border-amber-500/50' : 'bg-gradient-to-br from-slate-100 to-slate-50 border-slate-300/60 group-hover:bg-gradient-to-br group-hover:from-amber-50 group-hover:to-amber-100 group-hover:border-amber-300/60'}`}>
                    <svg className={`w-6 h-6 transition-colors duration-300 group-hover:text-amber-600 ${isDark ? 'text-slate-300' : 'text-slate-700'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 002 2h10a2 2 0 002-2M9 7a2 2 0 012-2h10a2 2 0 012 2m0 0V7a2 2 0 00-2-2h-2.5a1 1 0 00-1 1v4m0 0h4" />
                    </svg>
                  </div>
                </div>
                <div className={`pt-4 border-t transition-colors duration-500 ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-100 text-slate-600'}`}>
                  <p className="text-sm">{statusSummary.down} down / {statusSummary.total} total</p>
                </div>
              </div>
            </div>

            {/* Status Card */}
            <div className="group relative animate-slideInUp" style={{ animationDelay: '0.2s' }}>
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-emerald-300 rounded-xl blur-lg opacity-0 group-hover:opacity-20 transition-opacity duration-500"></div>
              <div className={`relative border rounded-xl p-8 hover:border-slate-300/80 transition-all duration-300 shadow-sm hover:shadow-lg hover:-translate-y-1 ${isDark ? 'bg-slate-800 border-slate-700/80 hover:border-slate-600/80' : 'bg-white border-slate-200/80'}`}>
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <p className={`text-xs font-semibold uppercase tracking-wider transition-colors duration-500 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>System Status</p>
                    <h3 className={`text-4xl font-bold mt-3 group-hover:text-emerald-600 transition-colors duration-300 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                      <span className="inline-flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full animate-pulse ${statusSummary.down > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                        {statusSummary.down > 0 ? 'Degraded' : 'Healthy'}
                      </span>
                    </h3>
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center border transition-all duration-300 ${isDark ? 'bg-slate-700 border-slate-600 group-hover:bg-emerald-900/20 group-hover:border-emerald-500/50' : 'bg-gradient-to-br from-slate-100 to-slate-50 border-slate-300/60 group-hover:bg-gradient-to-br group-hover:from-emerald-50 group-hover:to-emerald-100 group-hover:border-emerald-300/60'}`}>
                    <svg className={`w-6 h-6 transition-colors duration-300 group-hover:text-emerald-600 ${isDark ? 'text-slate-300' : 'text-slate-700'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <div className={`pt-4 border-t transition-colors duration-500 ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-100 text-slate-600'}`}>
                  <p className="text-sm">{statusSummary.alive} alive / {statusSummary.total} monitored</p>
                </div>
              </div>
            </div>

            {/* Performance Card */}
            <div className="group relative animate-slideInUp" style={{ animationDelay: '0.3s' }}>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-blue-300 rounded-xl blur-lg opacity-0 group-hover:opacity-20 transition-opacity duration-500"></div>
              <div className={`relative border rounded-xl p-8 hover:border-slate-300/80 transition-all duration-300 shadow-sm hover:shadow-lg hover:-translate-y-1 ${isDark ? 'bg-slate-800 border-slate-700/80 hover:border-slate-600/80' : 'bg-white border-slate-200/80'}`}>
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <p className={`text-xs font-semibold uppercase tracking-wider transition-colors duration-500 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Uptime</p>
                    <h3 className={`text-4xl font-bold mt-3 group-hover:text-blue-600 transition-colors duration-300 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                      {averageLatency === null ? '--' : `${averageLatency}ms`}
                    </h3>
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center border transition-all duration-300 ${isDark ? 'bg-slate-700 border-slate-600 group-hover:bg-blue-900/20 group-hover:border-blue-500/50' : 'bg-gradient-to-br from-slate-100 to-slate-50 border-slate-300/60 group-hover:bg-gradient-to-br group-hover:from-blue-50 group-hover:to-blue-100 group-hover:border-blue-300/60'}`}>
                    <svg className={`w-6 h-6 transition-colors duration-300 group-hover:text-blue-600 ${isDark ? 'text-slate-300' : 'text-slate-700'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>
                <div className={`pt-4 border-t transition-colors duration-500 ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-100 text-slate-600'}`}>
                  <p className="text-sm">Average live latency</p>
                </div>
              </div>
            </div>
          </div>

          {/* Servers Section */}
          <div className="animate-slideInUp" style={{ animationDelay: '0.4s' }}>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className={`text-3xl font-bold mb-2 transition-colors duration-500 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Connected Servers</h2>
                <p className={`text-sm transition-colors duration-500 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Manage and monitor your MCP server instances
                  {lastUpdated ? ` • Updated ${lastUpdated}` : ''}
                  {refreshing ? ' • Refreshing...' : ''}
                </p>
              </div>
              <Link href="/register-server">
                <Button className="cursor-pointer bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 px-6 py-3 rounded-xl font-bold transition-all duration-300 hover:shadow-lg hover:shadow-emerald-400/50 hover:scale-105 shadow-md shadow-emerald-300/40">
                  ➕ Add Server
                </Button>
              </Link>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="inline-block">
                    <div className={`w-16 h-16 border-4 rounded-full animate-spin ${isDark ? 'border-amber-600/50 border-t-amber-400' : 'border-amber-300 border-t-amber-600'}`}></div>
                  </div>
                  <p className={`mt-4 transition-colors duration-500 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Loading servers...</p>
                </div>
              </div>
            ) : error ? (
              <div className={`rounded-2xl p-8 text-center border ${isDark ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'}`}>
                <p className={`font-medium transition-colors duration-500 ${isDark ? 'text-red-400' : 'text-red-600'}`}>⚠️ {error}</p>
              </div>
            ) : servers.length === 0 ? (
              <div className={`rounded-xl p-16 text-center border ${isDark ? 'bg-slate-800 border-slate-700/80' : 'bg-white border-slate-200'}`}>
                <div className={`text-5xl mb-6 opacity-60 ${isDark ? '' : ''}`}>🖥️</div>
                <h3 className={`text-xl font-bold mb-2 transition-colors duration-500 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>No Servers Connected</h3>
                <p className={`mb-8 max-w-md mx-auto transition-colors duration-500 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Start by registering your first MCP server to begin monitoring and management</p>
                <Link href="/register-server">
                  <Button className="cursor-pointer bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 px-8 py-3 rounded-lg font-semibold transition-all duration-300 hover:shadow-md inline-block">
                    Add Your First Server
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {servers.map((server, index) => {
                  const health = serverHealth[server.name];
                  const isAlive = health?.status === 'alive';

                  return (
                  <div
                    key={server.name}
                    className="group relative animate-slideInUp"
                    style={{ animationDelay: `${0.5 + index * 0.1}s` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-500 to-amber-400 rounded-xl blur-lg opacity-0 group-hover:opacity-20 transition-opacity duration-500"></div>
                    <div className={`relative border rounded-xl overflow-hidden hover:border-slate-300/80 transition-all duration-300 h-full shadow-sm hover:shadow-lg hover:-translate-y-1 ${isDark ? 'bg-slate-800 border-slate-700/80 hover:border-slate-600/80' : 'bg-white border-slate-200/80'}`}>
                      {/* Card header with gradient accent */}
                      <div className="h-1 bg-gradient-to-r from-amber-500 to-amber-400 group-hover:from-amber-600 group-hover:to-amber-500 transition-all duration-300"></div>
                      
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all duration-300 ${isDark ? 'bg-slate-700 border-slate-600 group-hover:bg-amber-900/20 group-hover:border-amber-500/50' : 'bg-gradient-to-br from-slate-100 to-slate-50 border-slate-300/60 group-hover:from-amber-50 group-hover:to-amber-100 group-hover:border-amber-300/60'}`}>
                            <svg className={`w-5 h-5 transition-colors duration-300 group-hover:text-amber-600 ${isDark ? 'text-slate-300' : 'text-slate-700'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                          </div>
                          <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${isAlive ? (isDark ? 'bg-emerald-900/30 border-emerald-500/30 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700') : (isDark ? 'bg-amber-900/30 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700')}`}>
                            <span className={`w-2 h-2 rounded-full animate-pulse ${isAlive ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                            <span className="text-xs font-semibold">{isAlive ? 'Alive' : 'Down'}</span>
                          </div>
                        </div>
                        
                        <h3 className={`text-lg font-bold mb-1 truncate line-clamp-1 group-hover:text-amber-600 transition-colors duration-300 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{server.name}</h3>
                        <p className={`text-xs font-mono mb-2 truncate opacity-75 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{server.url.split('//')[1] || server.url}</p>
                        <div className={`text-xs mb-4 space-y-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          <p>{health ? `${health.latency_ms} ms latency` : 'Waiting for status...'}</p>
                          <p>
                            {health && health.status === 'alive'
                              ? `${health.tool_count} tools`
                              : 'Tool count unavailable'}
                          </p>
                        </div>
                        
                        <div className="flex gap-2">
                          <Link href={`/servers/${encodeURIComponent(server.name)}`} className="flex-1">
                            <button className={`cursor-pointer w-full py-2 rounded-lg font-medium transition-all duration-200 text-sm border ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600 hover:border-slate-500' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'}`}>
                              View Tools
                            </button>
                          </Link>
                          <Link href={`/api-explorer?url=${encodeURIComponent(server.url)}&name=${encodeURIComponent(server.name)}`}>
                            <button className={`cursor-pointer px-3 py-2 rounded-lg transition-all duration-200 text-sm border font-medium ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-300 border-slate-600 hover:border-slate-500' : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                              APIs
                            </button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Applications Section */}
          <div className="animate-slideInUp mt-16" style={{ animationDelay: '0.5s' }}>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className={`text-3xl font-bold mb-2 transition-colors duration-500 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Registered Applications</h2>
                <p className={`text-sm transition-colors duration-500 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Manage your application base URLs and API endpoints
                  {` • ${appStatusSummary.alive} alive / ${appStatusSummary.down} down / ${appStatusSummary.total} total`}
                </p>
              </div>
              <Link href="/register-app">
                <Button className="cursor-pointer bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 px-6 py-3 rounded-xl font-bold transition-all duration-300 hover:shadow-lg hover:shadow-blue-400/50 hover:scale-105 shadow-md shadow-blue-300/40">
                  ➕ Add App
                </Button>
              </Link>
            </div>

            {apps.length === 0 ? (
              <div className={`rounded-xl p-16 text-center border ${isDark ? 'bg-slate-800 border-slate-700/80' : 'bg-white border-slate-200'}`}>
                <div className={`text-5xl mb-6 opacity-60 ${isDark ? '' : ''}`}>🔌</div>
                <h3 className={`text-xl font-bold mb-2 transition-colors duration-500 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>No Applications Registered</h3>
                <p className={`mb-8 max-w-md mx-auto transition-colors duration-500 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Start by registering your first application base URL to access its API endpoints</p>
                <Link href="/register-app">
                  <Button className="cursor-pointer bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 px-8 py-3 rounded-lg font-semibold transition-all duration-300 hover:shadow-md inline-block">
                    Add Your First App
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {apps.map((app, index) => {
                  const health = appHealth[app.name];
                  const isAlive = health?.status === 'alive';

                  return (
                  <Link
                    key={app.name}
                    href={
                      `/api-explorer?url=${encodeURIComponent(app.url)}&name=${encodeURIComponent(app.name)}` +
                      (app.openapi_path ? `&openapi_path=${encodeURIComponent(app.openapi_path)}` : '')
                    }
                  >
                    <div
                      className="group relative animate-slideInUp cursor-pointer"
                      style={{ animationDelay: `${0.6 + index * 0.1}s` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-400 rounded-xl blur-lg opacity-0 group-hover:opacity-20 transition-opacity duration-500"></div>
                      <div className={`relative border rounded-xl overflow-hidden hover:border-slate-300/80 transition-all duration-300 h-full shadow-sm hover:shadow-lg hover:-translate-y-1 ${isDark ? 'bg-slate-800 border-slate-700/80 hover:border-slate-600/80' : 'bg-white border-slate-200/80'}`}>
                        {/* Card header with gradient accent */}
                        <div className="h-1 bg-gradient-to-r from-blue-500 to-blue-400 group-hover:from-blue-600 group-hover:to-blue-500 transition-all duration-300"></div>
                        
                        <div className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all duration-300 ${isDark ? 'bg-slate-700 border-slate-600 group-hover:bg-blue-900/20 group-hover:border-blue-500/50' : 'bg-gradient-to-br from-slate-100 to-slate-50 border-slate-300/60 group-hover:from-blue-50 group-hover:to-blue-100 group-hover:border-blue-300/60'}`}>
                              <span className="text-lg">🔌</span>
                            </div>
                            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${isAlive ? (isDark ? 'bg-cyan-900/30 border-cyan-500/30 text-cyan-300' : 'bg-cyan-50 border-cyan-200 text-cyan-700') : (isDark ? 'bg-amber-900/30 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700')}`}>
                              <span className={`w-2 h-2 rounded-full animate-pulse ${isAlive ? 'bg-cyan-500' : 'bg-amber-500'}`}></span>
                              <span className="text-xs font-semibold">{isAlive ? 'Alive' : 'Down'}</span>
                            </div>
                          </div>
                          
                          <h3 className={`text-lg font-bold mb-1 truncate line-clamp-1 group-hover:text-blue-600 transition-colors duration-300 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{app.name}</h3>
                          <p className={`text-xs font-mono mb-2 truncate opacity-75 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{app.url.split('//')[1] || app.url}</p>
                          <div className={`text-xs mb-2 space-y-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            <p>{health ? `${health.latency_ms} ms latency` : 'Waiting for status...'}</p>
                            <p>
                              {health && health.status === 'alive'
                                ? `${health.endpoint_count} endpoints`
                                : 'Endpoint count unavailable'}
                            </p>
                          </div>
                          <p className={`text-xs font-mono mb-6 truncate opacity-60 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            {normalizeOpenApiUrl(app.url, app.openapi_path)}
                          </p>
                          
                          <div className="flex gap-2">
                            <button className={`cursor-pointer flex-1 py-2 rounded-lg font-medium transition-all duration-200 text-sm border ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600 hover:border-slate-500' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'}`}>
                              View APIs
                            </button>
                            <button className={`cursor-pointer px-3 py-2 rounded-lg transition-all duration-200 text-sm border font-medium ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-300 border-slate-600 hover:border-slate-500' : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                              •••
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
