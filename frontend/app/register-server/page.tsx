'use client';

import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import Navigation from '@/components/Navigation';
import { publicEnv } from '@/lib/env';
import { http, authenticatedFetch } from '@/services/http';

const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL;

type DomainType = 'ADM' | 'OPS';

interface ServerItem {
  name: string;
  url: string;
  description?: string;
  domain_type?: DomainType;
  selected_tools?: string[];
  is_enabled?: boolean;
  is_deleted?: boolean;
}

interface DiscoveredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ModalTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  db_id?: number;
  current_version?: string;
  is_enabled: boolean;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

export default function RegisterServerPage() {
  const DISCOVERY_PAGE_SIZE = 10;
  const REGISTERED_PAGE_SIZE = 10;
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    url: '',
    description: '',
    domain_type: 'ADM' as DomainType,
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredTools, setDiscoveredTools] = useState<DiscoveredTool[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [selectedServerName, setSelectedServerName] = useState<string | null>(null);
  const [registeredTools, setRegisteredTools] = useState<ModalTool[]>([]);
  const [registeredToolsLoading, setRegisteredToolsLoading] = useState(false);
  const [registeredToolsError, setRegisteredToolsError] = useState<string | null>(null);
  const [draftToolDescriptions, setDraftToolDescriptions] = useState<Record<string, string>>({});
  const [savingToolDescriptionName, setSavingToolDescriptionName] = useState<string | null>(null);
  const [selectedToolDescriptions, setSelectedToolDescriptions] = useState<Record<string, string>>({});
  const [discoveryPage, setDiscoveryPage] = useState(1);
  const [registeredSyncing, setRegisteredSyncing] = useState(false);
  const [registeredPage, setRegisteredPage] = useState(1);
  const [registeredSelectedTools, setRegisteredSelectedTools] = useState<Set<string>>(new Set());

  const activeTool = useMemo(
    () => discoveredTools.find((tool) => tool.name === activeToolName) ?? null,
    [activeToolName, discoveredTools]
  );
  const discoveryTotalPages = Math.max(1, Math.ceil(discoveredTools.length / DISCOVERY_PAGE_SIZE));
  const discoveryPageItems = useMemo(() => {
    const start = (discoveryPage - 1) * DISCOVERY_PAGE_SIZE;
    return discoveredTools.slice(start, start + DISCOVERY_PAGE_SIZE);
  }, [discoveredTools, discoveryPage]);
  const registeredTotalPages = Math.max(1, Math.ceil(registeredTools.length / REGISTERED_PAGE_SIZE));
  const registeredPageItems = useMemo(() => {
    const start = (registeredPage - 1) * REGISTERED_PAGE_SIZE;
    return registeredTools.slice(start, start + REGISTERED_PAGE_SIZE);
  }, [registeredTools, registeredPage]);
  const activeRegisteredTool = useMemo(
    () => registeredTools.find((tool) => tool.name === activeToolName) ?? null,
    [registeredTools, activeToolName]
  );

  const fetchServers = async () => {
    try {
      const response = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/servers?include_inactive=true`);
      const payload = await response.json();
      setServers(Array.isArray(payload?.servers) ? payload.servers : []);
    } catch {
      setServers([]);
    }
  };

  useEffect(() => {
    void fetchServers();
  }, []);

  const onChangeInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(null);
  };

  const onChangeDomain = (domain: DomainType) => {
    setFormData((prev) => ({ ...prev, domain_type: domain }));
    setError(null);
  };

  const fetchTools = async () => {
    setError(null);
    setSuccess(null);
    if (!formData.name.trim() || !formData.url.trim()) {
      setError('Name and URL are required before fetching MCP tools.');
      return;
    }

    setDiscovering(true);
    try {
      const response = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/discover-server-tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formData.name.trim(), url: formData.url.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to discover MCP tools');
      }

      const tools: DiscoveredTool[] = Array.isArray(payload?.tools) ? payload.tools : [];
      setDiscoveredTools(tools);
      const initial = new Set<string>(tools.map((tool) => tool.name));
      setSelectedTools(initial);
      const descriptionMap: Record<string, string> = {};
      tools.forEach((tool) => {
        descriptionMap[tool.name] = tool.description || '';
      });
      setSelectedToolDescriptions(descriptionMap);
      setActiveToolName(tools[0]?.name ?? null);
      setDiscoveryPage(1);
      setIsModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discover MCP tools');
    } finally {
      setDiscovering(false);
    }
  };

  const toggleTool = (toolName: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return next;
    });
  };

  const setSelectedToolDescription = (toolName: string, description: string) => {
    setSelectedToolDescriptions((prev) => ({ ...prev, [toolName]: description }));
  };

  const syncCatalog = async () => {
    await authenticatedFetch(
      `${NEXT_PUBLIC_BE_API_URL}/mcp/openapi/catalog?force_refresh=true&registry_only=false`
    ).catch(() => null);
  };

  const buildRegisteredToolRows = async (
    serverName: string,
    serverUrl: string,
    configuredSelectionOverride?: Set<string>
  ): Promise<ModalTool[]> => {
    const discoverResponse = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/discover-server-tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: serverName, url: serverUrl }),
    });
    const discoverPayload = await discoverResponse.json().catch(() => ({}));
    if (!discoverResponse.ok) {
      throw new Error(discoverPayload?.detail || 'Failed to fetch live MCP tools');
    }

    const liveTools: DiscoveredTool[] = Array.isArray(discoverPayload?.tools) ? discoverPayload.tools : [];
    const server = servers.find((item) => item.name === serverName);
    const configuredSelection = configuredSelectionOverride ?? (Array.isArray(server?.selected_tools)
      ? new Set((server?.selected_tools || []).map((item) => String(item).trim()).filter(Boolean))
      : new Set<string>());
    const allSelectedByDefault = configuredSelection.size === 0;

    const dbPayload = await http<{ tools: Array<{
      id: number;
      owner_id: string;
      name: string;
      description: string;
      source_type: string;
      current_version?: string;
      is_enabled: boolean;
    }> }>('/tools');
    const dbByName = new Map(
      (dbPayload.tools || [])
        .filter((tool) => tool.source_type === 'mcp' && tool.owner_id === `mcp:${serverName}`)
        .map((tool) => [tool.name, tool] as const)
    );

    return liveTools
      .map((tool) => {
        const dbTool = dbByName.get(tool.name);
        const isSelected = allSelectedByDefault ? true : configuredSelection.has(tool.name);
        return {
          name: tool.name,
          description: (dbTool?.description || tool.description || '').trim(),
          inputSchema: tool.inputSchema || {},
          db_id: dbTool?.id,
          current_version: dbTool?.current_version || '1.0.0',
          is_enabled: isSelected && (dbTool?.is_enabled ?? true),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const loadRegisteredTools = async (
    serverName: string,
    serverUrlOverride?: string,
    configuredSelectionOverride?: Set<string>
  ) => {
    setSelectedServerName(serverName);
    setRegisteredToolsLoading(true);
    setRegisteredToolsError(null);
    try {
      const server = servers.find((item) => item.name === serverName);
      const resolvedUrl = serverUrlOverride || server?.url;
      if (!resolvedUrl) {
        throw new Error('Server URL is missing');
      }
      const rows = await buildRegisteredToolRows(serverName, resolvedUrl, configuredSelectionOverride);
      setRegisteredTools(rows);
      setActiveToolName(rows[0]?.name ?? null);
      setRegisteredPage(1);
      setRegisteredSelectedTools(new Set(rows.filter((tool) => tool.is_enabled).map((tool) => tool.name)));
      const drafts: Record<string, string> = {};
      rows.forEach((tool) => {
        drafts[tool.name] = tool.description || '';
      });
      setDraftToolDescriptions(drafts);
    } catch (err) {
      setRegisteredTools([]);
      setRegisteredToolsError(err instanceof Error ? err.message : 'Failed to load registered tools');
    } finally {
      setRegisteredToolsLoading(false);
    }
  };

  const applyRegisteredToolSelection = async () => {
    if (!selectedServerName) return;
    setRegisteredSyncing(true);
    setRegisteredToolsError(null);
    try {
      const server = servers.find((item) => item.name === selectedServerName);
      if (!server?.url) throw new Error('Server not found');

      const selected = new Set(registeredSelectedTools);
      setRegisteredTools((prev) =>
        prev.map((row) => ({ ...row, is_enabled: selected.has(row.name) }))
      );

      await http(`/servers/${encodeURIComponent(selectedServerName)}`, {
        method: 'PATCH',
        body: JSON.stringify({ selected_tools: Array.from(selected) }),
      });
      await syncCatalog();
      await fetchServers();
      await loadRegisteredTools(selectedServerName, server.url, selected);
    } catch (err) {
      setRegisteredToolsError(err instanceof Error ? err.message : 'Failed to apply tool selection');
      const server = servers.find((item) => item.name === selectedServerName);
      if (server?.url) {
        await loadRegisteredTools(selectedServerName, server.url);
      }
    } finally {
      setRegisteredSyncing(false);
    }
  };

  const saveRegisteredToolDescription = async (tool: ModalTool) => {
    if (!selectedServerName) return;
    const nextDescription = (draftToolDescriptions[tool.name] ?? '').trim();
    if (nextDescription === (tool.description || '')) return;
    setSavingToolDescriptionName(tool.name);
    setRegisteredToolsError(null);
    try {
      if (!tool.is_enabled) {
        throw new Error('Enable the tool first, then save description.');
      }

      await syncCatalog();
      const payload = await http<{ tools: Array<{
        id: number;
        owner_id: string;
        name: string;
        source_type: string;
        current_version?: string;
      }> }>('/tools');
      const dbTool = (payload.tools || []).find(
        (item) =>
          item.owner_id === `mcp:${selectedServerName}` &&
          item.source_type === 'mcp' &&
          item.name === tool.name
      );
      if (!dbTool) {
        throw new Error('Tool record not found in registry. Re-enable and try again.');
      }

      await http(`/tools/${dbTool.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ description: nextDescription, version: dbTool.current_version || tool.current_version || '1.0.0' }),
      });
      setRegisteredTools((prev) =>
        prev.map((item) =>
          item.name === tool.name ? { ...item, description: nextDescription } : item
        )
      );
    } catch (err) {
      setRegisteredToolsError(err instanceof Error ? err.message : 'Failed to update tool description');
    } finally {
      setSavingToolDescriptionName(null);
    }
  };

  const registerSelected = async () => {
    if (selectedTools.size === 0) {
      setError('Select at least one MCP tool before registration.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/register-server`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          url: formData.url.trim(),
          description: formData.description.trim(),
          domain_type: formData.domain_type,
          selected_tools: Array.from(selectedTools),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || 'Registration failed');
      }

      setSuccess(`Registered server with ${selectedTools.size} selected tool(s).`);
      setFormData({ name: '', url: '', description: '', domain_type: 'ADM' });
      setIsModalOpen(false);
      setDiscoveredTools([]);
      setSelectedTools(new Set());
      setActiveToolName(null);
      await syncCatalog();
      const toolsPayload = await http<{ tools: Array<{
        id: number;
        owner_id: string;
        name: string;
        description: string;
        source_type: string;
        current_version?: string;
      }> }>('/tools');
      const ownerId = `mcp:${formData.name.trim()}`;
      const selectedNames = new Set(Array.from(selectedTools));
      const selectedRows = (toolsPayload.tools || []).filter(
        (tool) =>
          tool.source_type === 'mcp' &&
          tool.owner_id === ownerId &&
          selectedNames.has(tool.name)
      );
      await Promise.all(
        selectedRows.map((tool) => {
          const nextDescription = (selectedToolDescriptions[tool.name] || tool.description || '').trim();
          if (!nextDescription || nextDescription === (tool.description || '')) return Promise.resolve();
          return http(`/tools/${tool.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ description: nextDescription, version: tool.current_version || '1.0.0' }),
          });
        })
      );
      await fetchServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 overflow-hidden">
      <Navigation pageTitle="Fetch MCP Tools" />

      <main className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative z-10">
        <div className="grid md:grid-cols-2 gap-8">
          <section>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent mb-2">Fetch MCP Tools</h2>
            <p className="text-slate-600 mb-6">Discover MCP tools, inspect configurations, and register selected tools.</p>

            {success && <div className="mb-4 p-3 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700">{success}</div>}
            {error && <div className="mb-4 p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-700">{error}</div>}

            <div className="space-y-4 bg-white/85 border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Server Name</label>
                <input name="name" value={formData.name} onChange={onChangeInput} className="w-full px-3 py-2 rounded-lg border border-slate-300" placeholder="e.g. test-mcp" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Server URL</label>
                <input name="url" value={formData.url} onChange={onChangeInput} className="w-full px-3 py-2 rounded-lg border border-slate-300" placeholder="http://127.0.0.1:8005/mcp" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea name="description" value={formData.description} onChange={onChangeInput} className="w-full px-3 py-2 rounded-lg border border-slate-300" rows={3} />
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Domain Type</p>
                <div className="flex gap-4">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input type="radio" checked={formData.domain_type === 'ADM'} onChange={() => onChangeDomain('ADM')} />
                    ADM
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input type="radio" checked={formData.domain_type === 'OPS'} onChange={() => onChangeDomain('OPS')} />
                    OPS
                  </label>
                </div>
              </div>

              <Button onClick={fetchTools} disabled={discovering || loading} className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
                {discovering ? 'Fetching MCP Tools...' : 'Fetch MCP Tools'}
              </Button>
            </div>
          </section>

          <section>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent mb-2">Registered MCP Servers</h2>
            <p className="text-slate-600 mb-6">Includes active and inactive servers for status tracking.</p>

            <div className="space-y-3">
              {servers.length === 0 && <div className="p-6 rounded-xl border border-slate-200 bg-white">No servers found.</div>}
              {servers.map((server) => (
                <button
                  key={server.name}
                  type="button"
                  onClick={() => void loadRegisteredTools(server.name)}
                  className="w-full text-left p-4 rounded-xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-blue-50 hover:border-cyan-400 transition-colors shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{server.name}</p>
                      <p className="text-sm text-slate-600 break-all">{server.url}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="text-slate-700">{server.domain_type || 'ADM'}</p>
                      <p className={server.is_deleted ? 'text-red-600' : server.is_enabled ? 'text-emerald-600' : 'text-amber-600'}>
                        {server.is_deleted ? 'Deleted' : server.is_enabled ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-[120] bg-black/50 p-4 md:p-8 overflow-auto">
          <div className="max-w-6xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Select MCP Tools</h3>
                <p className="text-xs text-slate-600 mt-1">Choose tools to register for {formData.name || 'this server'}.</p>
              </div>
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Close</Button>
            </div>

            <div className="grid md:grid-cols-2 gap-0">
              <div className="p-4 border-r border-slate-200 max-h-[70vh] overflow-auto">
                {discoveredTools.length === 0 && <p className="text-sm text-slate-600">No tools discovered.</p>}
                {discoveredTools.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setSelectedTools(new Set(discoveredTools.map((tool) => tool.name)))}>
                        Select All
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setSelectedTools(new Set())}>
                        Unselect All
                      </Button>
                    </div>
                    <p className="text-xs text-slate-600">Page {discoveryPage} / {discoveryTotalPages}</p>
                  </div>
                )}
                <div className="space-y-2">
                  {discoveryPageItems.map((tool) => (
                    <button
                      key={tool.name}
                      type="button"
                      onClick={() => setActiveToolName(tool.name)}
                      className={`w-full text-left p-3 rounded-lg border ${activeToolName === tool.name ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-slate-900">{tool.name}</p>
                        <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={selectedTools.has(tool.name)}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleTool(tool.name);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          Selected
                        </label>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{tool.description || 'No description'}</p>
                      <textarea
                        value={selectedToolDescriptions[tool.name] ?? ''}
                        onChange={(e) => setSelectedToolDescription(tool.name, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 w-full px-2 py-1 text-xs rounded border border-slate-300"
                        rows={2}
                        placeholder="Description override for registration"
                      />
                    </button>
                  ))}
                </div>
                {discoveredTools.length > DISCOVERY_PAGE_SIZE && (
                  <div className="mt-3 flex items-center justify-between">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDiscoveryPage((prev) => Math.max(1, prev - 1))}
                      disabled={discoveryPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDiscoveryPage((prev) => Math.min(discoveryTotalPages, prev + 1))}
                      disabled={discoveryPage === discoveryTotalPages}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>

              <div className="p-4 max-h-[70vh] overflow-auto">
                {!activeTool && <p className="text-sm text-slate-600">Select a tool to view its configuration.</p>}
                {activeTool && (
                  <div className="space-y-3">
                    <h4 className="text-base font-semibold text-slate-900">{activeTool.name}</h4>
                    <p className="text-sm text-slate-700">{activeTool.description || 'No description'}</p>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1">Required Parameters / Input Schema</p>
                      <pre className="text-xs bg-slate-950 text-slate-100 rounded-lg p-3 overflow-auto">{formatJson(activeTool.inputSchema)}</pre>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between">
              <p className="text-sm text-slate-700">Selected: {selectedTools.size} / {discoveredTools.length}</p>
              <Button onClick={registerSelected} disabled={loading || selectedTools.size === 0} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
                {loading ? 'Registering...' : 'Register Selected Tools'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedServerName && (
        <div className="fixed inset-0 z-[120] bg-black/50 p-4 md:p-8 overflow-auto">
          <div className="max-w-6xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Registered MCP Tools</h3>
                <p className="text-xs text-slate-600 mt-1">Server: {selectedServerName} (database-backed controls)</p>
              </div>
              <Button variant="secondary" onClick={() => setSelectedServerName(null)}>Close</Button>
            </div>

            <div className="p-4">
              {registeredSyncing && (
                <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                  <span className="h-4 w-4 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin" />
                  Syncing latest state...
                </div>
              )}
              {registeredToolsError && (
                <div className="mb-3 p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm">
                  {registeredToolsError}
                </div>
              )}

              {registeredToolsLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="h-4 w-4 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin" />
                  Loading tools...
                </div>
              ) : registeredTools.length === 0 ? (
                <p className="text-sm text-slate-600">No tools discovered for this server.</p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setRegisteredSelectedTools(new Set(registeredTools.map((row) => row.name)))}
                        className="bg-emerald-50 border-emerald-300 text-emerald-700"
                      >
                        Select All
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setRegisteredSelectedTools(new Set())}
                        className="bg-rose-50 border-rose-300 text-rose-700"
                      >
                        Unselect All
                      </Button>
                    </div>
                    <p className="text-xs text-slate-600">Page {registeredPage} / {registeredTotalPages}</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-0 border border-slate-200 rounded-xl overflow-hidden">
                    <div className="p-4 border-r border-slate-200 max-h-[60vh] overflow-auto bg-slate-50/60">
                      <div className="space-y-2">
                        {registeredPageItems.map((tool) => (
                          <button
                            key={tool.name}
                            type="button"
                            onClick={() => setActiveToolName(tool.name)}
                            className={`w-full text-left p-3 rounded-lg border ${activeToolName === tool.name ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-slate-900">{tool.name}</p>
                              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={registeredSelectedTools.has(tool.name)}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    setRegisteredSelectedTools((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(tool.name)) next.delete(tool.name);
                                      else next.add(tool.name);
                                      return next;
                                    });
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                Enabled
                              </label>
                            </div>
                            <p className="text-xs text-slate-600 mt-1 line-clamp-2">{tool.description || 'No description'}</p>
                          </button>
                        ))}
                      </div>

                      {registeredTools.length > REGISTERED_PAGE_SIZE && (
                        <div className="mt-3 flex items-center justify-between">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setRegisteredPage((prev) => Math.max(1, prev - 1))}
                            disabled={registeredPage === 1}
                          >
                            Previous
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setRegisteredPage((prev) => Math.min(registeredTotalPages, prev + 1))}
                            disabled={registeredPage === registeredTotalPages}
                          >
                            Next
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="p-4 max-h-[60vh] overflow-auto bg-white">
                      {!activeRegisteredTool ? (
                        <p className="text-sm text-slate-600">Select a tool to view configuration.</p>
                      ) : (
                        <div className="space-y-3">
                          <h4 className="text-base font-semibold text-slate-900">{activeRegisteredTool.name}</h4>
                          <p className="text-xs text-slate-600">
                            Current state: {registeredSelectedTools.has(activeRegisteredTool.name) ? 'Enabled' : 'Disabled'}
                          </p>
                          <textarea
                            value={draftToolDescriptions[activeRegisteredTool.name] ?? ''}
                            onChange={(e) =>
                              setDraftToolDescriptions((prev) => ({ ...prev, [activeRegisteredTool.name]: e.target.value }))
                            }
                            className="w-full min-w-[260px] px-2 py-1 text-xs rounded border border-slate-300"
                            rows={2}
                            placeholder="Tool description"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void saveRegisteredToolDescription(activeRegisteredTool)}
                            disabled={savingToolDescriptionName === activeRegisteredTool.name || registeredSyncing}
                          >
                            {savingToolDescriptionName === activeRegisteredTool.name ? 'Saving...' : 'Save Description'}
                          </Button>
                          <div>
                            <p className="text-xs font-semibold text-slate-700 mb-1">Input Schema</p>
                            <pre className="text-xs bg-slate-950 text-slate-100 rounded-lg p-3 overflow-auto">{formatJson(activeRegisteredTool.inputSchema)}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between">
              <p className="text-sm text-slate-700">Enabled: {registeredSelectedTools.size} / {registeredTools.length}</p>
              <Button
                onClick={() => void applyRegisteredToolSelection()}
                disabled={registeredSyncing || registeredToolsLoading}
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
              >
                {registeredSyncing ? 'Applying...' : 'Apply Selection'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
