'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Navigation from '@/components/Navigation';
import { publicEnv } from '@/lib/env';

const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL
const POLICY_STORAGE_KEY = 'mcp_access_control_policies_v1';

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

interface OwnerPolicy {
  defaultMode: AccessMode;
  endpointModes: Record<string, AccessMode>;
}

type Policies = Record<string, OwnerPolicy>;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */




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

  /* --- derived --- */
  const backendOrigin = NEXT_PUBLIC_BE_API_URL?.replace(/\/+$/, '') ?? '';
  const combinedMcpUrl = backendOrigin ? `${backendOrigin}/mcp/apps` : '/mcp/apps';

  const combinedToolsByApp = useMemo(() => {
    const map: Record<string, CatalogTool[]> = {};
    for (const tool of catalogTools) {
      if (!map[tool.app]) map[tool.app] = [];
      map[tool.app].push(tool);
    }
    return map;
  }, [catalogTools]);

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
        fetch(`${NEXT_PUBLIC_BE_API_URL}/servers`),
        fetch(`${NEXT_PUBLIC_BE_API_URL}/mcp/openapi/catalog?force_refresh=false`),
      ]);

      if (serversRes.status === 'fulfilled' && serversRes.value.ok) {
        const payload = await serversRes.value.json();
        setServers(Array.isArray(payload?.servers) ? payload.servers : []);
      }

      if (catalogRes.status === 'fulfilled' && catalogRes.value.ok) {
        const payload = await catalogRes.value.json();
        setCatalogTools(Array.isArray(payload?.tools) ? payload.tools : []);
        setCatalogToolCount(typeof payload?.tool_count === 'number' ? payload.tool_count : 0);
        setCatalogSummary(payload?.summary ?? null);
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
          const res = await fetch(
            `${NEXT_PUBLIC_BE_API_URL}/servers/${encodeURIComponent(serverName)}/tools`
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
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    });
  }, []);

  /* --- render --- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 overflow-hidden">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-80 h-80 bg-violet-400/8 rounded-full blur-3xl animate-float"></div>
        <div
          className="absolute bottom-20 right-10 w-80 h-80 bg-cyan-400/8 rounded-full blur-3xl animate-float"
          style={{ animationDelay: '1s' }}
        ></div>
      </div>

      <Navigation pageTitle="MCP Endpoints" />

      <main className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-600 to-cyan-600 bg-clip-text text-transparent">
              MCP Endpoints
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              Connect your MCP client to any endpoint below. Click to view available tools &amp; permissions.
            </p>
          </div>
          <button
            onClick={() => fetchData()}
            className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 font-semibold text-sm transition-all hover:scale-105"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-amber-100 border border-amber-300 rounded-xl p-4 text-amber-700">
            <p className="font-semibold">Notice:</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-violet-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-3 text-slate-600 font-medium">Loading endpoints...</span>
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

                  <div className="p-6 bg-gradient-to-br from-white via-violet-50/30 to-cyan-50/20">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-300/40">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                          </svg>
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-slate-900">Combined MCP Server</h2>
                          <p className="text-sm text-slate-500">All registered API apps exposed as MCP tools</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full border border-violet-200">
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
                        className="flex-1 flex items-center gap-2 bg-slate-900 text-slate-100 px-4 py-2.5 rounded-lg font-mono text-sm cursor-pointer hover:bg-slate-800 transition-colors"
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
                          <p className="text-2xl font-bold text-violet-600">{catalogSummary?.apps_total ?? 0}</p>
                          <p className="text-xs text-slate-500">Apps</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-purple-600">{catalogToolCount}</p>
                          <p className="text-xs text-slate-500">Tools</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-emerald-600">{catalogSummary?.healthy ?? 0}</p>
                          <p className="text-xs text-slate-500">Healthy</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </button>

              {/* Expanded: Combined MCP tools grouped by app */}
              {expandedCard === 'combined' && (
                <div className="mt-3 border border-violet-200 rounded-2xl bg-white/90 p-5 shadow-lg animate-slideInUp">
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
                    Tools by App ({catalogToolCount})
                  </h3>
                  {Object.keys(combinedToolsByApp).length === 0 ? (
                    <p className="text-sm text-slate-500">No tools available. Register API apps to see tools here.</p>
                  ) : (
                    <div className="space-y-5">
                      {Object.entries(combinedToolsByApp).map(([appName, tools]) => (
                        <div key={appName}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full bg-violet-500"></div>
                            <h4 className="text-sm font-bold text-slate-800">{appName}</h4>
                            <span className="text-xs text-slate-400">{tools.length} tools</span>
                          </div>
                          <div className="grid gap-2 ml-4">
                            {tools.map((tool) => {
                              const mode = tool.access_mode || 'deny';
                              return (
                                <div
                                  key={tool.name}
                                  className={`flex items-center justify-between p-3 rounded-lg border transition-all hover:shadow-sm ${tool.is_placeholder
                                    ? 'bg-slate-50 border-slate-200 opacity-60'
                                    : 'bg-white border-slate-200'
                                    }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-slate-800 truncate">{tool.title || tool.name}</p>
                                    <p className="text-xs text-slate-500 truncate">
                                      <span className="font-mono font-bold text-blue-600">{tool.method.toUpperCase()}</span>{' '}
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
              <h2 className="text-lg font-bold text-slate-800 mb-1">Individual MCP Servers</h2>
              <p className="text-sm text-slate-500">
                Each server can be connected independently via its own MCP endpoint.
              </p>
            </div>

            {servers.length === 0 ? (
              <div className="text-center py-16 bg-white/60 rounded-2xl border border-dashed border-slate-300">
                <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                <p className="text-slate-500 font-medium">No MCP servers registered yet.</p>
                <p className="text-sm text-slate-400 mt-1">Register servers via the Register Server page.</p>
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
                          <div className="p-5 bg-white">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-md shadow-emerald-200/40">
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
                                  <h3 className="text-base font-bold text-slate-900">{server.name}</h3>
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded-full border border-emerald-200">
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
                              className="flex items-center gap-2 bg-slate-900 text-slate-100 px-3 py-2 rounded-lg font-mono text-xs cursor-pointer hover:bg-slate-800 transition-colors"
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
                              <p className="text-xs text-emerald-600 mt-2 font-semibold">{tools.length} tools available</p>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Expanded: Server tools */}
                      {isExpanded && (
                        <div className="mt-3 border border-emerald-200 rounded-2xl bg-white/90 p-5 shadow-lg animate-slideInUp">
                          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
                            Tools — {server.name}
                          </h3>

                          {isLoadingTools && (
                            <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                              Loading tools...
                            </div>
                          )}

                          {toolsError && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                              {toolsError}
                            </div>
                          )}

                          {tools && tools.length === 0 && (
                            <p className="text-sm text-slate-500">No tools reported by this server.</p>
                          )}

                          {tools && tools.length > 0 && (
                            <div className="grid gap-2">
                              {tools.map((tool) => {
                                const mode = tool.access_mode || 'deny';
                                return (
                                  <div
                                    key={tool.name}
                                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white hover:shadow-sm transition-all"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-semibold text-slate-800">{tool.name}</p>
                                      <p className="text-xs text-slate-500 truncate">{tool.description}</p>
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

