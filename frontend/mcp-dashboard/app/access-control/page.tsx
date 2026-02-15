'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Navigation from '@/components/Navigation';
import Button from '@/components/ui/Button';

const NEXT_PUBLIC_BE_API_URL = process.env.NEXT_PUBLIC_BE_API_URL;
const POLICY_STORAGE_KEY = 'mcp_access_control_policies_v1';

type OwnerType = 'app' | 'mcp';
type AccessMode = 'allow' | 'approval' | 'deny';

interface ServerItem {
  name: string;
  url: string;
}

interface AppItem {
  name: string;
  url: string;
  openapi_path?: string;
  include_unreachable_tools?: boolean;
}

interface CatalogTool {
  name: string;
  title: string;
  app: string;
  method: string;
  path: string;
  is_placeholder?: boolean;
  placeholder_reason?: string | null;
}

interface CatalogAppDiagnostic {
  name: string;
  url: string;
  openapi_path: string;
  include_unreachable_tools: boolean;
  status: 'healthy' | 'unreachable' | 'zero_endpoints' | string;
  operation_count: number;
  tool_count: number;
  placeholder_tool_added: boolean;
  used_openapi_url: string | null;
  rounds_attempted: number;
  requests_attempted: number;
  latency_ms: number;
  error: string | null;
}

interface OwnerItem {
  id: string;
  type: OwnerType;
  name: string;
  url: string;
  endpointCount: number;
}

interface EndpointItem {
  id: string;
  displayName: string;
  subtitle: string;
  isPlaceholder?: boolean;
  placeholderReason?: string | null;
}

interface OwnerPolicy {
  defaultMode: AccessMode;
  endpointModes: Record<string, AccessMode>;
}

type Policies = Record<string, OwnerPolicy>;

const ACCESS_MODES: Array<{ value: AccessMode; label: string }> = [
  { value: 'allow', label: 'Allow' },
  { value: 'approval', label: 'Require Approval' },
  { value: 'deny', label: 'Deny' },
];

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseServers(payload: unknown): ServerItem[] {
  const root = toObject(payload);
  if (!root) return [];
  const raw = root.servers;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const obj = toObject(item);
      if (!obj) return null;
      const name = typeof obj.name === 'string' ? obj.name : '';
      const url = typeof obj.url === 'string' ? obj.url : '';
      if (!name || !url) return null;
      return { name, url };
    })
    .filter((item): item is ServerItem => item !== null);
}

function parseApps(payload: unknown): AppItem[] {
  const root = toObject(payload);
  if (!root) return [];
  const raw = root.base_urls;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const obj = toObject(item);
      if (!obj) return null;
      const name = typeof obj.name === 'string' ? obj.name : '';
      const url = typeof obj.url === 'string' ? obj.url : '';
      if (!name || !url) return null;
      const openapiPath = typeof obj.openapi_path === 'string' ? obj.openapi_path : '';
      const includeUnreachableTools = typeof obj.include_unreachable_tools === 'boolean'
        ? obj.include_unreachable_tools
        : false;
      return {
        name,
        url,
        openapi_path: openapiPath,
        include_unreachable_tools: includeUnreachableTools,
      };
    })
    .filter((item): item is AppItem => item !== null);
}

function parseCatalogTools(payload: unknown): {
  tools: CatalogTool[];
  syncErrors: string[];
  appDiagnostics: CatalogAppDiagnostic[];
} {
  const root = toObject(payload);
  if (!root) return { tools: [], syncErrors: [], appDiagnostics: [] };

  const rawTools = root.tools;
  const rawErrors = root.sync_errors;
  const rawApps = root.apps;

  const tools = Array.isArray(rawTools)
    ? rawTools
      .map((item) => {
        const obj = toObject(item);
        if (!obj) return null;

        const name = typeof obj.name === 'string' ? obj.name : '';
        const title = typeof obj.title === 'string' ? obj.title : name;
        const app = typeof obj.app === 'string' ? obj.app : '';
        const method = typeof obj.method === 'string' ? obj.method : '';
        const path = typeof obj.path === 'string' ? obj.path : '';
        if (!name || !app || !method || !path) return null;
        const isPlaceholder = typeof obj.is_placeholder === 'boolean' ? obj.is_placeholder : false;
        const placeholderReason = typeof obj.placeholder_reason === 'string' ? obj.placeholder_reason : null;

        return { name, title, app, method, path, is_placeholder: isPlaceholder, placeholder_reason: placeholderReason };
      })
      .filter((item): item is CatalogTool => item !== null)
    : [];

  const syncErrors = Array.isArray(rawErrors)
    ? rawErrors.filter((item): item is string => typeof item === 'string')
    : [];

  const appDiagnostics = Array.isArray(rawApps)
    ? rawApps
      .map((item) => {
        const obj = toObject(item);
        if (!obj) return null;
        const name = typeof obj.name === 'string' ? obj.name : '';
        const url = typeof obj.url === 'string' ? obj.url : '';
        if (!name || !url) return null;
        const openapiPath = typeof obj.openapi_path === 'string' ? obj.openapi_path : '';
        const includeUnreachableTools =
          typeof obj.include_unreachable_tools === 'boolean' ? obj.include_unreachable_tools : false;
        const status = typeof obj.status === 'string' ? obj.status : 'unknown';
        const operationCount = typeof obj.operation_count === 'number' ? obj.operation_count : 0;
        const toolCount = typeof obj.tool_count === 'number' ? obj.tool_count : 0;
        const placeholderToolAdded =
          typeof obj.placeholder_tool_added === 'boolean' ? obj.placeholder_tool_added : false;
        const usedOpenapiUrl = typeof obj.used_openapi_url === 'string' ? obj.used_openapi_url : null;
        const roundsAttempted = typeof obj.rounds_attempted === 'number' ? obj.rounds_attempted : 0;
        const requestsAttempted = typeof obj.requests_attempted === 'number' ? obj.requests_attempted : 0;
        const latencyMs = typeof obj.latency_ms === 'number' ? obj.latency_ms : 0;
        const error = typeof obj.error === 'string' ? obj.error : null;

        return {
          name,
          url,
          openapi_path: openapiPath,
          include_unreachable_tools: includeUnreachableTools,
          status,
          operation_count: operationCount,
          tool_count: toolCount,
          placeholder_tool_added: placeholderToolAdded,
          used_openapi_url: usedOpenapiUrl,
          rounds_attempted: roundsAttempted,
          requests_attempted: requestsAttempted,
          latency_ms: latencyMs,
          error,
        };
      })
      .filter((item): item is CatalogAppDiagnostic => item !== null)
    : [];

  return { tools, syncErrors, appDiagnostics };
}

function parseMcpToolEndpoints(payload: unknown): EndpointItem[] {
  const root = toObject(payload);
  if (!root) return [];

  const rawTools = root.tools;
  if (!Array.isArray(rawTools)) return [];

  return rawTools
    .map((item) => {
      const obj = toObject(item);
      if (!obj) return null;

      const name = typeof obj.name === 'string' ? obj.name : '';
      if (!name) return null;
      const description =
        typeof obj.description === 'string' && obj.description.trim().length > 0
          ? obj.description
          : 'No description';

      return {
        id: name,
        displayName: name,
        subtitle: description,
      };
    })
    .filter((item): item is EndpointItem => item !== null);
}

function modeClass(mode: AccessMode): string {
  switch (mode) {
    case 'allow':
      return 'bg-emerald-100 text-emerald-700 border-emerald-300';
    case 'deny':
      return 'bg-red-100 text-red-700 border-red-300';
    default:
      return 'bg-amber-100 text-amber-700 border-amber-300';
  }
}

function modeLabel(mode: AccessMode): string {
  if (mode === 'allow') return 'Allow';
  if (mode === 'deny') return 'Deny';
  return 'Require Approval';
}

function diagnosticStatusClass(status: string): string {
  if (status === 'healthy') return 'bg-emerald-100 text-emerald-700 border-emerald-300';
  if (status === 'zero_endpoints') return 'bg-amber-100 text-amber-700 border-amber-300';
  if (status === 'unreachable') return 'bg-red-100 text-red-700 border-red-300';
  return 'bg-slate-100 text-slate-700 border-slate-300';
}

function diagnosticStatusLabel(status: string): string {
  if (status === 'healthy') return 'Healthy';
  if (status === 'zero_endpoints') return 'Zero Endpoints';
  if (status === 'unreachable') return 'Unreachable';
  return status;
}

export default function AccessControlPage() {
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [catalogTools, setCatalogTools] = useState<CatalogTool[]>([]);
  const [catalogSyncErrors, setCatalogSyncErrors] = useState<string[]>([]);
  const [appDiagnostics, setAppDiagnostics] = useState<CatalogAppDiagnostic[]>([]);
  const [diagnosticRetries, setDiagnosticRetries] = useState<number>(2);

  const [mcpEndpointsByServer, setMcpEndpointsByServer] = useState<Record<string, EndpointItem[]>>({});
  const [mcpEndpointErrorByServer, setMcpEndpointErrorByServer] = useState<Record<string, string>>({});

  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [policies, setPolicies] = useState<Policies>({});

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [endpointLoading, setEndpointLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const owners = useMemo<OwnerItem[]>(() => {
    const appOwners: OwnerItem[] = apps.map((app) => ({
      id: `app:${app.name}`,
      type: 'app',
      name: app.name,
      url: app.url,
      endpointCount: catalogTools.filter((tool) => tool.app === app.name).length,
    }));

    const mcpOwners: OwnerItem[] = servers.map((server) => ({
      id: `mcp:${server.name}`,
      type: 'mcp',
      name: server.name,
      url: server.url,
      endpointCount: mcpEndpointsByServer[server.name]?.length || 0,
    }));

    return [...appOwners, ...mcpOwners];
  }, [apps, servers, catalogTools, mcpEndpointsByServer]);

  const selectedOwner = useMemo(
    () => owners.find((item) => item.id === selectedOwnerId) || null,
    [owners, selectedOwnerId]
  );

  const selectedEndpoints = useMemo<EndpointItem[]>(() => {
    if (!selectedOwner) return [];

    if (selectedOwner.type === 'app') {
      return catalogTools
        .filter((tool) => tool.app === selectedOwner.name)
        .map((tool) => ({
          id: tool.name,
          displayName: `${tool.method.toUpperCase()} ${tool.path}`,
          subtitle: tool.title,
          isPlaceholder: tool.is_placeholder,
          placeholderReason: tool.placeholder_reason,
        }));
    }

    return mcpEndpointsByServer[selectedOwner.name] || [];
  }, [selectedOwner, catalogTools, mcpEndpointsByServer]);

  const selectedOwnerError = selectedOwner?.type === 'mcp' ? mcpEndpointErrorByServer[selectedOwner.name] : null;

  const fetchOwnersAndCatalog = useCallback(async (silent = false) => {
    if (!NEXT_PUBLIC_BE_API_URL) {
      setError('Backend API URL is not configured (NEXT_PUBLIC_BE_API_URL)');
      setLoading(false);
      return;
    }

    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [serversRes, appsRes, catalogRes] = await Promise.allSettled([
        fetch(`${NEXT_PUBLIC_BE_API_URL}/servers`),
        fetch(`${NEXT_PUBLIC_BE_API_URL}/base-urls`),
        fetch(`${NEXT_PUBLIC_BE_API_URL}/mcp/openapi/catalog?force_refresh=true&retries=${diagnosticRetries}`),
      ]);

      const warnings: string[] = [];

      if (serversRes.status === 'fulfilled' && serversRes.value.ok) {
        const payload = await serversRes.value.json();
        setServers(parseServers(payload));
      } else {
        warnings.push('servers');
      }

      if (appsRes.status === 'fulfilled' && appsRes.value.ok) {
        const payload = await appsRes.value.json();
        setApps(parseApps(payload));
      } else {
        warnings.push('app servers');
      }

      if (catalogRes.status === 'fulfilled' && catalogRes.value.ok) {
        const payload = await catalogRes.value.json();
        const parsed = parseCatalogTools(payload);
        setCatalogTools(parsed.tools);
        setCatalogSyncErrors(parsed.syncErrors);
        setAppDiagnostics(parsed.appDiagnostics);
      } else {
        warnings.push('combined MCP catalog');
        setCatalogTools([]);
        setCatalogSyncErrors([]);
        setAppDiagnostics([]);
      }

      if (warnings.length === 0) {
        setError(null);
      } else {
        setError(`Partial load issue: ${warnings.join(', ')}`);
      }

      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load access-control data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [diagnosticRetries]);

  useEffect(() => {
    fetchOwnersAndCatalog();
  }, [fetchOwnersAndCatalog]);

  useEffect(() => {
    if (!selectedOwnerId && owners.length > 0) {
      setSelectedOwnerId(owners[0].id);
      return;
    }
    if (selectedOwnerId && !owners.some((item) => item.id === selectedOwnerId)) {
      setSelectedOwnerId(owners.length > 0 ? owners[0].id : null);
    }
  }, [owners, selectedOwnerId]);

  const fetchPolicies = useCallback(async () => {
    try {
      if (!NEXT_PUBLIC_BE_API_URL) return;
      setLoadingPolicies(true);
      const res = await fetch(`${NEXT_PUBLIC_BE_API_URL}/access-policies`);
      if (!res.ok) throw new Error('Failed to fetch policies');
      const data = await res.json();
      setPolicies(data.policies || {});
    } catch (error) {
      console.error('Error fetching policies:', error);
    } finally {
      setLoadingPolicies(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  useEffect(() => {
    if (!selectedOwner || selectedOwner.type !== 'mcp') return;

    if (mcpEndpointsByServer[selectedOwner.name]) return;
    if (mcpEndpointErrorByServer[selectedOwner.name]) return;
    if (!NEXT_PUBLIC_BE_API_URL) return;

    const loadMcpEndpoints = async () => {
      try {
        setEndpointLoading(true);
        const response = await fetch(
          `${NEXT_PUBLIC_BE_API_URL}/servers/${encodeURIComponent(selectedOwner.name)}/tools`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch tools (HTTP ${response.status})`);
        }

        const payload = await response.json();
        const endpoints = parseMcpToolEndpoints(payload);
        setMcpEndpointsByServer((prev) => ({ ...prev, [selectedOwner.name]: endpoints }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch MCP endpoints';
        setMcpEndpointErrorByServer((prev) => ({ ...prev, [selectedOwner.name]: message }));
      } finally {
        setEndpointLoading(false);
      }
    };

    loadMcpEndpoints();
  }, [selectedOwner, mcpEndpointsByServer, mcpEndpointErrorByServer]);

  const getPolicy = useCallback(
    (ownerId: string): OwnerPolicy => policies[ownerId] || { defaultMode: 'approval', endpointModes: {} },
    [policies]
  );

  const updateDefaultMode = useCallback(async (ownerId: string, mode: AccessMode) => {
    // Optimistic update
    setPolicies((prev) => {
      const previous = prev[ownerId] || { defaultMode: 'approval' as AccessMode, endpointModes: {} };
      return { ...prev, [ownerId]: { ...previous, defaultMode: mode } };
    });

    try {
      const res = await fetch(`http://localhost:8090/access-policies/${encodeURIComponent(ownerId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error('Failed to update policy');
      fetchPolicies();
    } catch (error) {
      console.error('Error updating default mode:', error);
      toast.error('Failed to save policy change');
      fetchPolicies(); // Revert/refresh on error
    }
  }, [fetchPolicies]);

  const updateEndpointMode = useCallback(async (ownerId: string, endpointId: string, mode: AccessMode) => {
    // Optimistic update
    setPolicies((prev) => {
      const previous = prev[ownerId] || { defaultMode: 'approval' as AccessMode, endpointModes: {} };
      return {
        ...prev,
        [ownerId]: {
          ...previous,
          endpointModes: { ...previous.endpointModes, [endpointId]: mode },
        },
      };
    });

    try {
      const res = await fetch(
        `http://localhost:8090/access-policies/${encodeURIComponent(ownerId)}/${encodeURIComponent(endpointId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        }
      );
      if (!res.ok) throw new Error('Failed to update endpoint policy');
      fetchPolicies();
    } catch (error) {
      console.error('Error updating endpoint mode:', error);
      toast.error('Failed to save policy change');
      fetchPolicies();
    }
  }, [fetchPolicies]);

  const resetEndpointMode = useCallback(async (ownerId: string, endpointId: string) => {
    setPolicies((prev) => {
      const previous = prev[ownerId] || { defaultMode: 'approval' as AccessMode, endpointModes: {} };
      const nextEndpointModes = { ...previous.endpointModes };
      delete nextEndpointModes[endpointId];
      return {
        ...prev,
        [ownerId]: {
          ...previous,
          endpointModes: nextEndpointModes,
        },
      };
    });

    try {
      const res = await fetch(
        `http://localhost:8090/access-policies/${encodeURIComponent(ownerId)}/${encodeURIComponent(endpointId)}`,
        {
          method: 'DELETE',
        }
      );
      if (!res.ok) throw new Error('Failed to reset endpoint policy');
      fetchPolicies();
    } catch (error) {
      console.error('Error resetting endpoint mode:', error);
      toast.error('Failed to reset policy');
      fetchPolicies();
    }
  }, [fetchPolicies]);

  const applyToAllEndpoints = useCallback(async (ownerId: string, mode: AccessMode, endpoints: EndpointItem[]) => {
    const endpointIds = endpoints.map((e) => e.id);

    setPolicies((prev) => {
      const previous = prev[ownerId] || { defaultMode: 'approval' as AccessMode, endpointModes: {} };
      const nextEndpointModes = { ...previous.endpointModes };
      endpoints.forEach((endpoint) => {
        nextEndpointModes[endpoint.id] = mode;
      });
      return {
        ...prev,
        [ownerId]: {
          ...previous,
          defaultMode: mode,
          endpointModes: nextEndpointModes,
        },
      };
    });

    try {
      const res = await fetch(`http://localhost:8090/access-policies/${encodeURIComponent(ownerId)}/apply-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, tool_ids: endpointIds }),
      });
      if (!res.ok) throw new Error('Failed to apply bulk policy');
      fetchPolicies();
    } catch (error) {
      console.error('Error applying bulk policy:', error);
      toast.error('Failed to apply policies');
      fetchPolicies();
    }
  }, [fetchPolicies]);

  const selectedPolicy = selectedOwner ? getPolicy(selectedOwner.id) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-80 h-80 bg-emerald-400/8 rounded-full blur-3xl animate-float"></div>
        <div
          className="absolute bottom-20 right-10 w-80 h-80 bg-blue-400/8 rounded-full blur-3xl animate-float"
          style={{ animationDelay: '1s' }}
        ></div>
      </div>

      <Navigation pageTitle="Access Control" />

      <main className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative z-10">
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent">
              Endpoint Access Control
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              Manage permission policy for each MCP-exposed endpoint.{' '}
              {lastUpdated ? `Updated ${lastUpdated}` : 'Awaiting initial sync'}
              {refreshing ? ' | Refreshing...' : ''}
            </p>
          </div>
          <Button
            onClick={() => fetchOwnersAndCatalog(true)}
            className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 font-semibold"
          >
            Refresh
          </Button>
        </div>

        {error && (
          <div className="mb-6 bg-amber-100 border border-amber-300 rounded-xl p-4 text-amber-700">
            <p className="font-semibold">Notice:</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="mb-6 bg-white/85 border border-slate-200 rounded-xl p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Combined MCP OpenAPI Diagnostics</p>
              <p className="text-xs text-slate-500">
                Shows all app servers including unreachable and zero-endpoint apps.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">Retries</label>
              <select
                value={diagnosticRetries}
                onChange={(e) => setDiagnosticRetries(Number(e.target.value))}
                className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs"
              >
                <option value={0}>0</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
              </select>
            </div>
          </div>

          {appDiagnostics.length === 0 ? (
            <p className="text-xs text-slate-500">No app diagnostics available.</p>
          ) : (
            <div className="space-y-2">
              {appDiagnostics.map((diag) => (
                <div key={diag.name} className="border border-slate-200 rounded-lg p-3 bg-slate-50/80">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{diag.name}</p>
                      <p className="text-xs text-slate-500 truncate">{diag.url}</p>
                      <p className="text-[11px] text-slate-500">
                        OpenAPI Path: {diag.openapi_path || '/openapi.json (auto)'} | Ops: {diag.operation_count} | MCP
                        Tools: {diag.tool_count}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Retries/Attempts: {diag.rounds_attempted} rounds, {diag.requests_attempted} requests | Latency:{' '}
                        {diag.latency_ms} ms
                      </p>
                      {diag.error && <p className="text-[11px] text-red-700 mt-1">{diag.error}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${diagnosticStatusClass(diag.status)}`}
                      >
                        {diagnosticStatusLabel(diag.status)}
                      </span>
                      <span className="text-[11px] text-slate-600">
                        Placeholder: {diag.placeholder_tool_added ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {catalogSyncErrors.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <p className="text-xs font-semibold text-amber-700 mb-1">Sync Issues</p>
              <div className="space-y-1">
                {catalogSyncErrors.map((syncError) => (
                  <p key={syncError} className="text-xs text-amber-700">
                    - {syncError}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-[320px_1fr] gap-6">
          <section className="bg-white/80 border border-slate-200 rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Owners</h2>

            {loading ? (
              <p className="text-sm text-slate-500">Loading owners...</p>
            ) : owners.length === 0 ? (
              <p className="text-sm text-slate-500">No app servers or MCP servers found.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-blue-700 mb-2">App Servers</p>
                  <div className="space-y-2">
                    {owners
                      .filter((owner) => owner.type === 'app')
                      .map((owner) => (
                        <button
                          key={owner.id}
                          onClick={() => setSelectedOwnerId(owner.id)}
                          className={`w-full text-left p-3 rounded-xl border transition ${selectedOwnerId === owner.id
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                        >
                          <p className="text-sm font-semibold text-slate-800 truncate">{owner.name}</p>
                          <p className="text-xs text-slate-500 truncate">{owner.url}</p>
                          <p className="text-xs text-blue-700 mt-1">{owner.endpointCount} MCP endpoints</p>
                        </button>
                      ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-emerald-700 mb-2">MCP Servers</p>
                  <div className="space-y-2">
                    {owners
                      .filter((owner) => owner.type === 'mcp')
                      .map((owner) => (
                        <button
                          key={owner.id}
                          onClick={() => setSelectedOwnerId(owner.id)}
                          className={`w-full text-left p-3 rounded-xl border transition ${selectedOwnerId === owner.id
                            ? 'bg-emerald-50 border-emerald-300'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                        >
                          <p className="text-sm font-semibold text-slate-800 truncate">{owner.name}</p>
                          <p className="text-xs text-slate-500 truncate">{owner.url}</p>
                          <p className="text-xs text-emerald-700 mt-1">
                            {owner.endpointCount > 0 ? `${owner.endpointCount} tools` : 'Click to load tools'}
                          </p>
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="bg-white/80 border border-slate-200 rounded-2xl p-6 shadow-sm">
            {!selectedOwner ? (
              <p className="text-slate-500">Select an app owner or MCP server to manage endpoint access.</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <p className="text-xs uppercase tracking-wide font-semibold text-slate-500">
                      {selectedOwner.type === 'app' ? 'App Owner' : 'MCP Server'}
                    </p>
                    <h2 className="text-2xl font-bold text-slate-900">{selectedOwner.name}</h2>
                    <p className="text-sm text-slate-500 break-all">{selectedOwner.url}</p>
                  </div>
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full border ${selectedOwner.type === 'app'
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'bg-emerald-100 border-emerald-300 text-emerald-700'
                      }`}
                  >
                    {selectedOwner.type === 'app' ? 'Combined MCP APIs' : 'Native MCP Tools'}
                  </span>
                </div>

                {selectedPolicy && (
                  <div className="mb-6 border border-slate-200 rounded-xl p-4 bg-slate-50">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Access Policy Controls</p>
                    <div className="grid md:grid-cols-[220px_1fr] gap-3 items-end">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Default for all endpoints</label>
                        <select
                          value={selectedPolicy.defaultMode}
                          onChange={(e) => updateDefaultMode(selectedOwner.id, e.target.value as AccessMode)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm"
                        >
                          {ACCESS_MODES.map((mode) => (
                            <option key={mode.value} value={mode.value}>
                              {mode.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-3">
                        <Button
                          onClick={() =>
                            applyToAllEndpoints(selectedOwner.id, selectedPolicy.defaultMode, selectedEndpoints)
                          }
                          className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800"
                        >
                          Apply Selected Mode To All Endpoints
                        </Button>
                        <p className="text-xs text-slate-500">Policies are stored locally in this browser for now.</p>
                      </div>
                    </div>
                  </div>
                )}

                {endpointLoading && selectedOwner.type === 'mcp' && (
                  <p className="text-sm text-slate-500 mb-4">Loading MCP tools...</p>
                )}

                {selectedOwnerError && (
                  <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    {selectedOwnerError}
                  </div>
                )}

                {selectedEndpoints.length === 0 ? (
                  <p className="text-sm text-slate-500">No MCP-exposed endpoints found for this selection.</p>
                ) : (
                  <div className="space-y-3">
                    {selectedEndpoints.map((endpoint) => {
                      const mode = selectedPolicy
                        ? selectedPolicy.endpointModes[endpoint.id] || selectedPolicy.defaultMode
                        : 'approval';
                      const isOverride = selectedPolicy ? endpoint.id in selectedPolicy.endpointModes : false;

                      return (
                        <div key={endpoint.id} className="border border-slate-200 rounded-xl p-4 bg-white">
                          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">{endpoint.displayName}</p>
                              <p className="text-xs text-slate-500 truncate">{endpoint.subtitle}</p>
                              <p className="text-[11px] text-slate-400 mt-1">Tool: {endpoint.id}</p>
                              {endpoint.isPlaceholder && (
                                <p className="text-[11px] text-amber-700 mt-1">
                                  Placeholder tool: {endpoint.placeholderReason || 'endpoint unavailable'}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${modeClass(mode)}`}>
                                {modeLabel(mode)}
                              </span>
                              <select
                                value={mode}
                                onChange={(e) =>
                                  updateEndpointMode(selectedOwner.id, endpoint.id, e.target.value as AccessMode)
                                }
                                className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm"
                              >
                                {ACCESS_MODES.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              {isOverride && (
                                <Button
                                  onClick={() => resetEndpointMode(selectedOwner.id, endpoint.id)}
                                  className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                                >
                                  Reset
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
