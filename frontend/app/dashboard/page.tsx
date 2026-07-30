'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { publicEnv } from '@/lib/env';
import { authenticatedFetch } from '@/services/http';
import { toast } from '@/lib/toast';
import { useUser } from '@/context/UserContext';
import { Server as ServerIcon, AppWindow, RefreshCw } from 'lucide-react';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { HealthGrid } from '@/components/dashboard/HealthGrid';
import { SystemServices } from '@/components/dashboard/SystemServices';
import { QuickActions } from '@/components/dashboard/QuickActions';

const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL;
const STATUS_POLL_MS = 10000;
const DOWN_AFTER_FAILURES = 2;

export interface Server {
  name: string;
  url: string;
}

export interface BaseURL {
  name: string;
  url: string;
  openapi_path?: string;
  include_unreachable_tools?: boolean;
}

export interface ServerHealth {
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

export interface AppHealth {
  name: string;
  url: string;
  status: 'alive' | 'down';
  latency_ms: number;
  endpoint_count: number;
  error: string | null;
}

export interface SystemStatus {
  name: string;
  key: string;
  status: 'up' | 'down' | 'disabled';
  ok: boolean;
  detail: string;
}

interface BackendHealthResponse {
  status: 'ok' | 'degraded' | 'down';
  db_backend: string;
  auth_enabled: boolean;
  issuer: string;
  audience_check: boolean;
  response_time_ms: number;
  systems: SystemStatus[];
}

export default function Dashboard() {
  const [servers, setServers] = useState<Server[]>([]);
  const [apps, setApps] = useState<BaseURL[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const wsRef = useRef<WebSocket | null>(null);
  const wsRetryRef = useRef<number | null>(null);
  const backendToastShownRef = useRef(false);
  const [systemStatuses, setSystemStatuses] = useState<SystemStatus[]>([]);
  const [healthStatus, setHealthStatus] = useState<'ok' | 'degraded' | 'down' | null>(null);
  const { user, role: contextRole, isAdmin } = useUser();
  const userRole = contextRole || user?.primary_role || 'developer';
  const { resolvedTheme } = useTheme();

  const showBackendOfflineToast = useCallback(() => {
    if (backendToastShownRef.current) return;
    backendToastShownRef.current = true;
    toast.error('Backend is not reachable. Please start the backend service.');
  }, []);

  const clearBackendOfflineToastFlag = useCallback(() => {
    backendToastShownRef.current = false;
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
    return Object.values(paths).reduce<number>((total, pathItem) => {
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
      const response = await authenticatedFetch(openApiProxyUrl, { signal: controller.signal });
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

  const fetchData = useCallback(async (silent = false) => {
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
        authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/servers`),
        authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/base-urls`),
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

      setStatusSummary(summarizeServers(activeServers, serverHealthRef.current));
      setAppStatusSummary(summarizeApps(activeApps, appHealthRef.current));

      if (!silent) {
        setLoading(false);
      }

      const statusTask = authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/servers/status`).then(async (res) => {
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
        showBackendOfflineToast();
      } else {
        setError(null);
        clearBackendOfflineToastFlag();
      }
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      }
      showBackendOfflineToast();
      console.error('Error fetching data:', err);
    } finally {
      pollInFlightRef.current = false;
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [
    clearBackendOfflineToastFlag,
    mergeAppHealth,
    mergeServerHealth,
    probeAppHealth,
    showBackendOfflineToast,
    summarizeApps,
    summarizeServers,
  ]);

  const fetchSystemHealth = useCallback(async (silent = false) => {
    if (!NEXT_PUBLIC_BE_API_URL) return;

    try {
      const response = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/health`);
      const payload = (await response.json()) as BackendHealthResponse;
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setSystemStatuses(Array.isArray(payload.systems) ? payload.systems : []);
      setHealthStatus(payload.status);
      clearBackendOfflineToastFlag();
    } catch (err) {
      setHealthStatus('down');
      setSystemStatuses([
        {
          name: 'Backend API',
          key: 'backend',
          status: 'down',
          ok: false,
          detail: err instanceof Error ? err.message : 'Backend is unreachable',
        },
      ]);
      if (!silent) {
        showBackendOfflineToast();
      }
    }
  }, [clearBackendOfflineToastFlag, showBackendOfflineToast]);

  useEffect(() => {
    void fetchData();
    if (isAdmin) {
      void fetchSystemHealth();
    }
    const intervalId = window.setInterval(() => {
      void fetchData(true);
      if (isAdmin) {
        void fetchSystemHealth(true);
      }
    }, STATUS_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, [fetchData, fetchSystemHealth, isAdmin]);

  useEffect(() => {
    if (!NEXT_PUBLIC_BE_API_URL) return;
    
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const envWsUrl = process.env.NEXT_PUBLIC_WS_URL;
    let wsUrl = '';
    
    if (envWsUrl) {
      wsUrl = envWsUrl;
    } else {
      const beUrlStr = process.env.NEXT_PUBLIC_BE_API_URL || '';
      let derivedHost = `${window.location.hostname}:8000`;
      if (beUrlStr) {
        try {
          const parsed = new URL(beUrlStr);
          if (!['backend', 'mcp-backend'].includes(parsed.hostname)) {
            derivedHost = parsed.host;
          }
        } catch (e) {}
      }
      wsUrl = `${wsProtocol}//${derivedHost}/ws/health`;
    }
    
    const connect = () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = () => {
        void fetchData(true);
        void fetchSystemHealth(true);
      };

      ws.onclose = () => {
        if (wsRetryRef.current) {
          window.clearTimeout(wsRetryRef.current);
        }
        wsRetryRef.current = window.setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      if (wsRetryRef.current) {
        window.clearTimeout(wsRetryRef.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [fetchData, fetchSystemHealth]);

  return (
    <div className="max-w-6xl mx-auto py-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Dashboard</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Overview of your system status
            {lastUpdated && <span className="ml-2 border-l border-[var(--border-default)] pl-2">Last updated: {lastUpdated}</span>}
          </p>
        </div>
        <button
          onClick={() => { void fetchData(); if (isAdmin) void fetchSystemHealth(); }}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-md text-[var(--text-primary)] hover:bg-[var(--bg-inset)] transition-colors self-start sm:self-auto"
          disabled={loading || refreshing}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="mb-8 p-4 bg-[var(--accent-danger-soft,rgba(239,68,68,0.1))] border border-[var(--accent-danger)] rounded-lg text-[var(--accent-danger)]">
          {error}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="Total Servers"
          value={loading ? '-' : statusSummary.total}
          icon={<ServerIcon className="text-[var(--accent-primary)] w-5 h-5" />}
          iconBgColor="var(--accent-primary-soft)"
        />
        <MetricCard
          title="Servers Online"
          value={loading ? '-' : statusSummary.alive}
          icon={<ServerIcon className="text-[var(--accent-success)] w-5 h-5" />}
          iconBgColor="var(--accent-success-soft)"
        />
        <MetricCard
          title="Total Applications"
          value={loading ? '-' : appStatusSummary.total}
          icon={<AppWindow className="text-[var(--accent-purple,#9333ea)] w-5 h-5" />}
          iconBgColor="var(--accent-purple-soft,#f3e8ff)"
        />
        <MetricCard
          title="Apps Online"
          value={loading ? '-' : appStatusSummary.alive}
          icon={<AppWindow className="text-[var(--accent-success)] w-5 h-5" />}
          iconBgColor="var(--accent-success-soft)"
        />
      </div>

      <QuickActions />

      <HealthGrid 
        servers={servers} 
        apps={apps} 
        serverHealth={serverHealth} 
        appHealth={appHealth} 
        loading={loading}
      />

      {isAdmin && <SystemServices systems={systemStatuses} />}
    </div>
  );
}
