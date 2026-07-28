'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Navigation from '@/components/Navigation';
import { publicEnv } from '@/lib/env';
import { authenticatedFetch } from '@/services/http';

const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface ServerItem {
  name: string;
  url: string;
}

interface CatalogTool {
  name: string;
  title: string;
  app: string;
  method: string;
  path: string;
  is_placeholder?: boolean;
  access_mode?: AccessMode;
}

interface CatalogSummary {
  apps_total: number;
  healthy: number;
  zero_endpoints: number;
  unreachable: number;
}

interface McpTool {
  name: string;
  description: string;
  access_mode?: AccessMode;
}

type AccessMode = 'allow' | 'approval' | 'deny';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */




async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy execCommand fallback
    }
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

function permissionBadgeClass(mode: AccessMode): string {
  switch (mode) {
    case 'allow':
      return 'bg-emerald-100 text-emerald-700 border-emerald-300';
    case 'deny':
      return 'bg-red-100 text-red-700 border-red-300';
    default:
      return 'bg-amber-100 text-amber-700 border-amber-300';
  }
}

function permissionLabel(mode: AccessMode): string {
  if (mode === 'allow') return 'Allow';
  if (mode === 'deny') return 'Deny';
  return 'Approval Required';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function McpEndpointsPage() {
  /* --- state --- */
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [catalogTools, setCatalogTools] = useState<CatalogTool[]>([]);
  const [catalogSummary, setCatalogSummary] = useState<CatalogSummary | null>(null);
  const [catalogToolCount, setCatalogToolCount] = useState(0);

  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [serverTools, setServerTools] = useState<Record<string, McpTool[]>>({});
  const [serverToolsLoading, setServerToolsLoading] = useState<Record<string, boolean>>({});
  const [serverToolsError, setServerToolsError] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');

  /* --- derived --- */
  const [combinedMcpUrl, setCombinedMcpUrl] = useState('/api/proxy/mcp/apps');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCombinedMcpUrl(`${window.location.origin}/api/proxy/mcp/apps`);
    }
  }, []);

  const filteredCatalogTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalogTools;
    return catalogTools.filter(
      (tool) =>
        (tool.name && tool.name.toLowerCase().includes(q)) ||
        (tool.title && tool.title.toLowerCase().includes(q)) ||
        (tool.app && tool.app.toLowerCase().includes(q)) ||
        (tool.method && tool.method.toLowerCase().includes(q)) ||
        (tool.path && tool.path.toLowerCase().includes(q))
    );
  }, [catalogTools, searchQuery]);

  const combinedToolsByApp = useMemo(() => {
    const map: Record<string, CatalogTool[]> = {};
    for (const tool of filteredCatalogTools) {
      if (!map[tool.app]) map[tool.app] = [];
      map[tool.app].push(tool);
    }
    return map;
  }, [filteredCatalogTools]);

  const filteredServers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return servers;
    return servers.filter(
      (server) =>
        (server.name && server.name.toLowerCase().includes(q)) ||
        (server.url && server.url.toLowerCase().includes(q))
    );
  }, [servers, searchQuery]);
  /* --- data fetching --- */
  const fetchData = useCallback(async () => {
    if (!NEXT_PUBLIC_BE_API_URL) {
      setError('Backend API URL is not configured (NEXT_PUBLIC_BE_API_URL)');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [serversRes, catalogRes] = await Promise.allSettled([
        authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/servers`),
        authenticatedFetch(
          `${NEXT_PUBLIC_BE_API_URL}/mcp/openapi/catalog?force_refresh=false&registry_only=true&public_only=false`
        ),
      ]);

      if (serversRes.status === 'fulfilled' && serversRes.value.ok) {
        const payload = await serversRes.value.json();
        setServers(Array.isArray(payload?.servers) ? payload.servers : []);
      }
      if (catalogRes.status === 'fulfilled' && catalogRes.value.ok) {
        const payload = await catalogRes.value.json();
        const tools = Array.isArray(payload?.tools)
          ? payload.tools
          : [
              ...(Array.isArray(payload?.openapi_tools) ? payload.openapi_tools : []),
              ...(Array.isArray(payload?.mcp_server_tools) ? payload.mcp_server_tools : [])
            ];
        setCatalogTools(tools);
        setCatalogToolCount(
          typeof payload?.tool_count === 'number' ? payload.tool_count : tools.length
        );
        const summary = payload?.summary || payload?.apps_summary || {};
        setCatalogSummary({
          apps_total: summary.apps_total ?? summary.total_apps ?? 0,
          healthy: summary.healthy ?? summary.healthy_apps ?? 0,
          zero_endpoints: summary.zero_endpoints ?? summary.zero_tool_apps ?? 0,
          unreachable: summary.unreachable ?? summary.unreachable_apps ?? 0,
        });
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* --- expand / load server tools --- */
  const toggleCard = useCallback(
    async (cardId: string) => {
      if (expandedCard === cardId) {
        setExpandedCard(null);
        return;
      }
      setExpandedCard(cardId);

      // For individual MCP servers, lazy-load tools
      if (cardId.startsWith('mcp:') && !serverTools[cardId]) {
        const serverName = cardId.replace('mcp:', '');
        setServerToolsLoading((prev) => ({ ...prev, [cardId]: true }));
        try {
          const res = await authenticatedFetch(
            `${NEXT_PUBLIC_BE_API_URL}/servers/${encodeURIComponent(serverName)}/tools?registry_only=true`
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const payload = await res.json();
          const tools: McpTool[] = Array.isArray(payload?.tools)
            ? payload.tools.map((t: Record<string, unknown>) => ({
              name: typeof t.name === 'string' ? t.name : '',
              description: typeof t.description === 'string' ? t.description : 'No description',
              access_mode: typeof t.access_mode === 'string' ? (t.access_mode as AccessMode) : 'approval',
            }))
            : [];
          setServerTools((prev) => ({ ...prev, [cardId]: tools }));
        } catch (err) {
          setServerToolsError((prev) => ({
            ...prev,
            [cardId]: err instanceof Error ? err.message : 'Failed to load tools',
          }));
        } finally {
          setServerToolsLoading((prev) => ({ ...prev, [cardId]: false }));
        }
      }
    },
    [expandedCard, serverTools]
  );

  /* --- copy url --- */
  const copyUrl = useCallback((url: string) => {
    const absoluteUrl = url.startsWith('/') ? `${window.location.origin}${url}` : url;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(absoluteUrl)
        .then(() => {
          setCopiedUrl(url);
          setTimeout(() => setCopiedUrl(null), 2000);
        })
        .catch((err) => {
          console.error('Clipboard API failed, trying fallback:', err);
          fallbackCopy(absoluteUrl, url);
        });
    } else {
      fallbackCopy(absoluteUrl, url);
    }
  }, []);

  const fallbackCopy = (text: string, displayUrl: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        setCopiedUrl(displayUrl);
        setTimeout(() => setCopiedUrl(null), 2000);
      }
    } catch (err) {
      console.error('Fallback copy failed', err);
    }
    document.body.removeChild(textArea);
  };

  /* --- render --- */
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Navigation pageTitle="MCP Endpoints" />

      <main className="pt-8 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-600 to-cyan-600 bg-clip-text text-transparent">
              MCP Endpoints
            </h1>
            <p className="text-slate-700 dark:text-slate-300 text-sm mt-1 font-medium">
              Connect your MCP client to any endpoint below. Click to view available tools &amp; permissions.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search tools or endpoints..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500/40 outline-none w-64 shadow-xs"
            />
            <button
              onClick={() => fetchData()}
              className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 px-4 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold text-sm transition-all shadow-xs cursor-pointer"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl p-4 text-amber-800 dark:text-amber-300">
            <p className="font-semibold">Notice:</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-3 text-slate-700 dark:text-slate-300 font-medium">Loading endpoints...</span>
          </div>
        ) : (
          <>
            {/* ====== COMBINED MCP SERVER (Hero Card) ====== */}
            <div className="mb-8">
              <button
                onClick={() => toggleCard('combined')}
                className={`w-full text-left group transition-all duration-300 ${expandedCard === 'combined' ? '' : 'hover:scale-[1.01]'
                  }`}
              >
                <div
                  className={`relative overflow-hidden rounded-2xl border-2 transition-all duration-300 ${expandedCard === 'combined'
                    ? 'border-violet-400 shadow-xl shadow-violet-200/30'
                    : 'border-violet-200 shadow-lg shadow-violet-100/20 hover:border-violet-300 hover:shadow-xl hover:shadow-violet-200/30'
                    }`}
                >
                  {/* Gradient top bar */}
                  <div className="h-1.5 bg-gradient-to-r from-violet-500 via-purple-500 to-cyan-500"></div>

                  <div className="p-6 bg-white dark:bg-slate-900">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-violet-500/30">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                          </svg>
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Combined MCP Server</h2>
                          <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Only public/client-allowed tools are exposed</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-xs font-semibold rounded-full border border-violet-200 dark:border-violet-800">
                          UNIFIED
                        </span>
                        <svg
                          className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${expandedCard === 'combined' ? 'rotate-180' : ''
                            }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Endpoint URL + stats */}
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                      <div
                        className="flex-1 flex items-center gap-2 bg-slate-900 dark:bg-slate-800 text-slate-100 px-4 py-2.5 rounded-xl font-mono text-sm cursor-pointer hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors border border-slate-800 dark:border-slate-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyUrl(combinedMcpUrl);
                        }}
                      >
                        <span className="truncate">{combinedMcpUrl}</span>
                        <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
                          {copiedUrl === combinedMcpUrl ? '✓ Copied!' : 'Click to copy'}
                        </span>
                      </div>
                      <div className="flex gap-4 text-sm">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{catalogSummary?.apps_total ?? 0}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Apps</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{catalogToolCount}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Tools</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{catalogSummary?.healthy ?? 0}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Healthy</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </button>

              {/* Expanded: Combined MCP tools grouped by app */}
              {expandedCard === 'combined' && (
                <div className="mt-3 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-lg animate-slideInUp">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wide mb-4">
                    Tools by App ({catalogToolCount})
                  </h3>
                  {Object.keys(combinedToolsByApp).length === 0 ? (
                    <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">No public tools available. Set access policy to Allow to expose tools.</p>
                  ) : (
                    <div className="space-y-5">
                      {Object.entries(combinedToolsByApp).map(([appName, tools]) => (
                        <div key={appName}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full bg-violet-500"></div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{appName}</h4>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{tools.length} tools</span>
                          </div>
                          <div className="grid gap-2 ml-4">
                            {tools.map((tool) => {
                              const mode = tool.access_mode || 'deny';
                              return (
                                <div
                                  key={tool.name}
                                  className={`flex items-center justify-between p-3 rounded-xl border transition-all hover:shadow-xs ${tool.is_placeholder
                                    ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 opacity-60'
                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                                    }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{tool.title || tool.name}</p>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{tool.method.toUpperCase()}</span>{' '}
                                      {tool.path}
                                    </p>
                                  </div>
                                  <span
                                    className={`ml-3 text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${permissionBadgeClass(mode)}`}
                                  >
                                    {permissionLabel(mode)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ====== INDIVIDUAL MCP SERVERS ====== */}
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Individual MCP Servers</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                Each server can be connected independently via its own MCP endpoint.
              </p>
            </div>

            {servers.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
                <svg className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                <p className="text-slate-700 dark:text-slate-300 font-medium">No MCP servers registered yet.</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Register servers via the Register Server page.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {servers.map((server) => {
                  const cardId = `mcp:${server.name}`;
                  const isExpanded = expandedCard === cardId;
                  const tools = serverTools[cardId];
                  const isLoadingTools = serverToolsLoading[cardId];
                  const toolsError = serverToolsError[cardId];

                  return (
                    <div key={server.name} className={isExpanded ? 'md:col-span-2 lg:col-span-3' : ''}>
                      <button
                        onClick={() => toggleCard(cardId)}
                        className={`w-full text-left transition-all duration-300 ${isExpanded ? '' : 'hover:scale-[1.02]'
                          }`}
                      >
                        <div
                          className={`rounded-2xl border-2 transition-all duration-300 overflow-hidden ${isExpanded
                            ? 'border-emerald-400 shadow-xl shadow-emerald-200/30'
                            : 'border-slate-200 shadow-md hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-100/20'
                            }`}
                        >
                          <div className="h-1 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
                          <div className="p-5 bg-white dark:bg-slate-900">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-sm shadow-emerald-500/30">
                                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                                    />
                                  </svg>
                                </div>
                                <div>
                                  <h3 className="text-base font-bold text-slate-900 dark:text-white">{server.name}</h3>
                                  <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold rounded-full border border-emerald-200 dark:border-emerald-800">
                                    MCP SERVER
                                  </span>
                                </div>
                              </div>
                              <svg
                                className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''
                                  }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>

                            {/* Server URL */}
                            <div
                              className="flex items-center gap-2 bg-slate-900 dark:bg-slate-800 text-slate-100 px-3 py-2 rounded-xl font-mono text-xs cursor-pointer hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors border border-slate-800 dark:border-slate-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyUrl(server.url);
                              }}
                            >
                              <span className="truncate">{server.url}</span>
                              <span className="ml-auto text-[10px] text-slate-400 whitespace-nowrap">
                                {copiedUrl === server.url ? '✓ Copied!' : 'Copy'}
                              </span>
                            </div>

                            {tools && (
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-semibold">{tools.length} tools available</p>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Expanded: Server tools */}
                      {isExpanded && (
                        <div className="mt-3 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-lg animate-slideInUp">
                          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wide mb-4">
                            Tools — {server.name}
                          </h3>

                          {isLoadingTools && (
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 py-4 font-medium">
                              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                              Loading tools...
                            </div>
                          )}

                          {toolsError && (
                            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-3 text-sm text-rose-700 dark:text-rose-300">
                              {toolsError}
                            </div>
                          )}

                          {tools && tools.length === 0 && (
                            <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">No tools reported by this server.</p>
                          )}

                          {tools && tools.length > 0 && (
                            <div className="grid gap-2">
                              {tools.map((tool) => {
                                const mode = tool.access_mode || 'deny';
                                return (
                                  <div
                                    key={tool.name}
                                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 hover:shadow-xs transition-all"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{tool.name}</p>
                                      <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{tool.description}</p>
                                    </div>
                                    <span
                                      className={`ml-3 text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${permissionBadgeClass(mode)}`}
                                    >
                                      {permissionLabel(mode)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
