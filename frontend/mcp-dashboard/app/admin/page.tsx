'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Navigation from '@/components/Navigation';
import Button from '@/components/ui/Button';
import { http } from '@/services/http';

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'super_admin' | 'admin' | 'operator' | 'read_only';

type DashboardCards = {
  total_applications: number;
  applications_alive: number;
  applications_down: number;
  total_mcp_servers: number;
  mcp_servers_alive: number;
  mcp_servers_down: number;
  total_tools: number;
  total_api_endpoints: number;
};

type AppItem = {
  name: string;
  url: string;
  description?: string;
  openapi_path: string;
  include_unreachable_tools: boolean;
  is_enabled?: boolean;
  is_deleted?: boolean;
};

type ServerItem = {
  name: string;
  url: string;
  description?: string;
  is_enabled?: boolean;
  is_deleted?: boolean;
};

type Tool = {
  id: number;
  owner_id: string;
  name: string;
  description: string;
  source_type: string;
  method: string | null;
  path: string | null;
  current_version: string;
  is_enabled: boolean;
};

type Endpoint = {
  id: number;
  owner_id: string;
  method: string;
  path: string;
  description: string;
  mcp_tool_id: number | null;
  current_version: string;
  is_enabled: boolean;
  exposed_to_mcp: boolean;
  exposure_approved: boolean;
};

type AuditLog = {
  id: number;
  actor: string;
  action: string;
  resource_type: string;
  resource_id: string;
  created_on: string | null;
};

type Tab = 'overview' | 'applications' | 'servers' | 'tools' | 'endpoints' | 'audit';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-100 text-emerald-700',
  POST: 'bg-blue-100 text-blue-700',
  PUT: 'bg-amber-100 text-amber-700',
  PATCH: 'bg-violet-100 text-violet-700',
  DELETE: 'bg-red-100 text-red-700',
};

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 max-w-sm w-full mx-4">
        <h3 className="font-semibold text-slate-900 text-lg mb-2">Confirm Action</h3>
        <p className="text-slate-600 text-sm mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={onConfirm}>Confirm</Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
      <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0H4" />
      </svg>
      <p className="text-sm">{message}</p>
    </div>
  );
}

function SectionError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 flex items-center justify-between text-sm">
      <span>{message}</span>
      {onRetry && <Button size="sm" variant="ghost" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminPanelPage() {
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Role is read from env/session — not switchable from UI in production.
  // In dev, it's read from localStorage (set externally via settings page or env).
  const [actorRole] = useState<Role>(() => {
    if (typeof window === 'undefined') return 'read_only';
    const stored = window.localStorage.getItem('mcp_admin_roles');
    return (['super_admin', 'admin', 'operator', 'read_only'].includes(stored ?? '')
      ? (stored as Role)
      : 'read_only');
  });

  const [stats, setStats] = useState<DashboardCards | null>(null);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Search/filter state
  const [appSearch, setAppSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const [toolSearch, setToolSearch] = useState('');
  const [endpointSearch, setEndpointSearch] = useState('');
  const [auditSearch, setAuditSearch] = useState('');

  // Audit pagination
  const [auditPage, setAuditPage] = useState(1);
  const AUDIT_PAGE_SIZE = 20;

  // Confirm dialog state
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // Edit state
  const [editingApp, setEditingApp] = useState<AppItem | null>(null);
  const [editingServer, setEditingServer] = useState<ServerItem | null>(null);

  // Inline description editing for tools and endpoints
  // Map of id -> current draft description (only set when user opens the edit field)
  const [toolDescEdits, setToolDescEdits] = useState<Record<number, string>>({});
  const [endpointDescEdits, setEndpointDescEdits] = useState<Record<number, string>>({});

  // Forms (create forms currently commented out — kept here for future use)
  const [appForm, setAppForm] = useState({
    name: '', url: '', description: '', openapi_path: '/openapi.json', include_unreachable_tools: false,
  });
  const [serverForm, setServerForm] = useState({ name: '', url: '', description: '' });
  /* toolForm — not in use while create tool form is commented out
  const [toolForm, setToolForm] = useState({
    owner_id: 'app:', name: '', description: '', version: '1.0.0', source_type: 'openapi',
  });
  */
  /* endpointForm — not in use while register endpoint form is commented out
  const [endpointForm, setEndpointForm] = useState({
    owner_id: 'app:', method: 'GET', path: '', description: '', version: '1.0.0',
    exposed_to_mcp: false, exposure_approved: false,
  });
  */

  // Permissions
  const canManageApps      = useMemo(() => ['super_admin', 'admin'].includes(actorRole), [actorRole]);
  const canManageServers   = useMemo(() => ['super_admin', 'admin'].includes(actorRole), [actorRole]);
  const canManageTools     = useMemo(() => ['super_admin', 'admin', 'operator'].includes(actorRole), [actorRole]);
  const canManageEndpoints = useMemo(() => ['super_admin', 'admin', 'operator'].includes(actorRole), [actorRole]);
  const canHardDelete      = useMemo(() => actorRole === 'super_admin', [actorRole]);
  const canApproveExposure = useMemo(() => ['super_admin', 'admin'].includes(actorRole), [actorRole]);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setGlobalError(null);
      const [statsRes, appsRes, serversRes, toolsRes, endpointsRes, auditRes] = await Promise.all([
        http<{ cards: DashboardCards }>('/dashboard/stats'),
        http<{ base_urls: AppItem[] }>('/base-urls?include_inactive=true'),
        http<{ servers: ServerItem[] }>('/servers?include_inactive=true'),
        http<{ tools: Tool[] }>('/tools'),
        http<{ endpoints: Endpoint[] }>('/endpoints'),
        http<{ logs: AuditLog[] }>('/audit-logs?limit=500'),
      ]);
      setStats(statsRes.cards);
      setApps(appsRes.base_urls || []);
      setServers(serversRes.servers || []);
      setTools(toolsRes.tools || []);
      setEndpoints(endpointsRes.endpoints || []);
      setAuditLogs(auditRes.logs || []);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // ── Action wrapper ────────────────────────────────────────────────────────

  const withAction = useCallback(async (fn: () => Promise<void>) => {
    try {
      setActionError(null);
      await fn();
      await fetchAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  }, [fetchAll]);

  const requireConfirm = (message: string, fn: () => void) => {
    setConfirm({ message, onConfirm: () => { setConfirm(null); fn(); } });
  };

  // ── App Actions ───────────────────────────────────────────────────────────

  const createApp = () => withAction(async () => {
    await http('/register-base-url', { method: 'POST', body: JSON.stringify(appForm) });
    setAppForm({ name: '', url: '', description: '', openapi_path: '/openapi.json', include_unreachable_tools: false });
  });

  const saveEditApp = (app: AppItem) => withAction(async () => {
    await http(`/base-urls/${encodeURIComponent(app.name)}`, {
      method: 'PATCH',
      body: JSON.stringify({ url: app.url, description: app.description, openapi_path: app.openapi_path }),
    });
    setEditingApp(null);
  });

  const patchApp = (app: AppItem, patch: Record<string, unknown>) =>
    withAction(() => http(`/base-urls/${encodeURIComponent(app.name)}`, { method: 'PATCH', body: JSON.stringify(patch) }));

  const deleteApp = (app: AppItem, hard: boolean) =>
    requireConfirm(
      hard ? `Permanently delete application "${app.name}"? This cannot be undone.` : `Soft-delete "${app.name}"?`,
      () => void withAction(() => http(`/base-urls/${encodeURIComponent(app.name)}?hard=${hard}`, { method: 'DELETE' })),
    );

  // ── Server Actions ────────────────────────────────────────────────────────

  const createServer = () => withAction(async () => {
    await http('/register-server', { method: 'POST', body: JSON.stringify(serverForm) });
    setServerForm({ name: '', url: '', description: '' });
  });

  const saveEditServer = (server: ServerItem) => withAction(async () => {
    await http(`/servers/${encodeURIComponent(server.name)}`, {
      method: 'PATCH',
      body: JSON.stringify({ url: server.url, description: server.description }),
    });
    setEditingServer(null);
  });

  const patchServer = (server: ServerItem, patch: Record<string, unknown>) =>
    withAction(() => http(`/servers/${encodeURIComponent(server.name)}`, { method: 'PATCH', body: JSON.stringify(patch) }));

  const deleteServer = (server: ServerItem, hard: boolean) =>
    requireConfirm(
      hard ? `Permanently delete server "${server.name}"? This cannot be undone.` : `Soft-delete "${server.name}"?`,
      () => void withAction(() => http(`/servers/${encodeURIComponent(server.name)}?hard=${hard}`, { method: 'DELETE' })),
    );

  // ── Tool Actions ──────────────────────────────────────────────────────────

  /* createTool — commented out, not needed right now
  const createTool = () => withAction(async () => {
    await http('/tools', { method: 'POST', body: JSON.stringify({ ...toolForm, description: toolForm.description.trim() }) });
    setToolForm((p) => ({ ...p, name: '', description: '' }));
  });
  */

  const toggleToolEnabled = (tool: Tool) =>
    withAction(() => http(`/tools/${tool.id}`, { method: 'PATCH', body: JSON.stringify({ is_enabled: !tool.is_enabled }) }));

  const saveToolDescription = (tool: Tool) =>
    withAction(async () => {
      const description = (toolDescEdits[tool.id] ?? tool.description).trim();
      await http(`/tools/${tool.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ description, version: tool.current_version || '1.0.0' }),
      });
      setToolDescEdits((prev) => { const next = { ...prev }; delete next[tool.id]; return next; });
    });

  // ── Endpoint Actions ──────────────────────────────────────────────────────

  /* createEndpoint — commented out, not needed right now
  const createEndpoint = () => withAction(async () => {
    await http('/endpoints', { method: 'POST', body: JSON.stringify({ ...endpointForm, description: endpointForm.description.trim() }) });
    setEndpointForm((p) => ({ ...p, path: '', description: '' }));
  });
  */

  const toggleEndpointExposure = (ep: Endpoint) =>
    withAction(() => http(`/endpoints/${ep.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        exposed_to_mcp: !ep.exposed_to_mcp,
        exposure_approved: ep.exposed_to_mcp ? ep.exposure_approved : true,
      }),
    }));

  const approveEndpointExposure = (ep: Endpoint) =>
    withAction(() => http(`/endpoints/${ep.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ exposure_approved: !ep.exposure_approved }),
    }));

  const saveEndpointDescription = (ep: Endpoint) =>
    withAction(async () => {
      const description = (endpointDescEdits[ep.id] ?? ep.description).trim();
      await http(`/endpoints/${ep.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ description, version: ep.current_version || '1.0.0' }),
      });
      setEndpointDescEdits((prev) => { const next = { ...prev }; delete next[ep.id]; return next; });
    });

  // ── Filtered data ─────────────────────────────────────────────────────────

  const filteredApps = useMemo(() => {
    const q = appSearch.toLowerCase();
    return apps.filter((a) => !q || a.name.toLowerCase().includes(q) || a.url.toLowerCase().includes(q));
  }, [apps, appSearch]);

  const filteredServers = useMemo(() => {
    const q = serverSearch.toLowerCase();
    return servers.filter((s) => !q || s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q));
  }, [servers, serverSearch]);

  const filteredTools = useMemo(() => {
    const q = toolSearch.toLowerCase();
    return tools.filter((t) => !q || t.name.toLowerCase().includes(q) || t.owner_id.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
  }, [tools, toolSearch]);

  const filteredEndpoints = useMemo(() => {
    const q = endpointSearch.toLowerCase();
    return endpoints.filter((e) => !q || e.path.toLowerCase().includes(q) || e.owner_id.toLowerCase().includes(q) || e.method.toLowerCase().includes(q));
  }, [endpoints, endpointSearch]);

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.toLowerCase();
    const filtered = auditLogs.filter((l) => !q || l.actor.toLowerCase().includes(q) || l.action.toLowerCase().includes(q) || l.resource_type.toLowerCase().includes(q));
    return { total: filtered.length, page: filtered.slice((auditPage - 1) * AUDIT_PAGE_SIZE, auditPage * AUDIT_PAGE_SIZE) };
  }, [auditLogs, auditSearch, auditPage]);

  // ── Overview cards ────────────────────────────────────────────────────────

  const statCards = stats
    ? [
      { label: 'Applications', total: stats.total_applications, alive: stats.applications_alive, down: stats.applications_down },
      { label: 'MCP Servers', total: stats.total_mcp_servers, alive: stats.mcp_servers_alive, down: stats.mcp_servers_down },
      { label: 'Tools', total: stats.total_tools },
      { label: 'API Endpoints', total: stats.total_api_endpoints },
    ]
    : [];

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview',      label: 'Overview' },
    { id: 'applications',  label: 'Applications', count: apps.length },
    { id: 'servers',       label: 'MCP Servers',  count: servers.length },
    { id: 'tools',         label: 'Tools',        count: tools.length },
    { id: 'endpoints',     label: 'API Endpoints',count: endpoints.length },
    { id: 'audit',         label: 'Audit Logs',   count: auditLogs.length },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/40 to-amber-50/60">
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      <Navigation pageTitle="Admin Panel" />

      <main className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-700 to-amber-700 bg-clip-text text-transparent">
              Admin Control Plane
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Governance for Applications, MCP Servers, Tools, and Endpoints
              {' · '}
              <span className={`font-semibold ${actorRole === 'super_admin' ? 'text-violet-600' : actorRole === 'admin' ? 'text-cyan-600' : 'text-slate-600'}`}>
                {actorRole}
              </span>
            </p>
          </div>
          <Button variant="primary" onClick={() => void fetchAll()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>

        {/* Global error */}
        {globalError && <SectionError message={globalError} onRetry={() => void fetchAll()} />}

        {/* Per-action error */}
        {actionError && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 text-orange-700 px-4 py-3 text-sm flex justify-between">
            {actionError}
            <button onClick={() => setActionError(null)} className="font-bold ml-4">✕</button>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-white border border-b-white border-slate-200 text-cyan-700 -mb-px relative z-10'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 text-xs bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((card) => (
                <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{card.label}</p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">{card.total}</p>
                  {card.alive !== undefined && (
                    <div className="flex gap-3 mt-2 text-xs">
                      <span className="text-emerald-600 font-medium">▲ {card.alive} alive</span>
                      {(card.down ?? 0) > 0 && <span className="text-red-500 font-medium">▼ {card.down} down</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Quick health summary */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Health Summary</h2>
              <div className="space-y-3">
                {[
                  { label: 'Applications', alive: stats?.applications_alive ?? 0, total: stats?.total_applications ?? 0 },
                  { label: 'MCP Servers', alive: stats?.mcp_servers_alive ?? 0, total: stats?.total_mcp_servers ?? 0 },
                ].map(({ label, alive, total }) => {
                  const pct = total > 0 ? Math.round((alive / total) * 100) : 0;
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600">{label}</span>
                        <span className={pct === 100 ? 'text-emerald-600 font-medium' : pct > 60 ? 'text-amber-600 font-medium' : 'text-red-600 font-medium'}>
                          {alive}/{total} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct > 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── APPLICATIONS TAB ─────────────────────────────────────────────── */}
        {activeTab === 'applications' && (
          <section className="rounded-2xl border border-cyan-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-semibold text-slate-900">Applications</h2>
              {!canManageApps && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Read-only</span>}
            </div>

            {/* Create form */}
            {canManageApps && (
              <details className="group rounded-xl border border-dashed border-cyan-300 bg-cyan-50/50 p-4">
                <summary className="cursor-pointer text-sm font-medium text-cyan-700 group-open:mb-4 list-none flex items-center gap-2">
                  <span className="text-lg leading-none">＋</span> Register New Application
                </summary>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Name *" value={appForm.name} onChange={(e) => setAppForm({ ...appForm, name: e.target.value })} />
                  <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Base URL *" value={appForm.url} onChange={(e) => setAppForm({ ...appForm, url: e.target.value })} />
                  <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Description" value={appForm.description} onChange={(e) => setAppForm({ ...appForm, description: e.target.value })} />
                  <input className="border rounded-lg px-3 py-2 text-sm" placeholder="OpenAPI path" value={appForm.openapi_path} onChange={(e) => setAppForm({ ...appForm, openapi_path: e.target.value })} />
                  <label className="flex items-center gap-2 text-sm text-slate-600 px-2">
                    <input type="checkbox" checked={appForm.include_unreachable_tools} onChange={(e) => setAppForm({ ...appForm, include_unreachable_tools: e.target.checked })} />
                    Include unreachable tools
                  </label>
                  <Button disabled={!appForm.name || !appForm.url} onClick={() => void createApp()}>Register App</Button>
                </div>
              </details>
            )}

            {/* Search */}
            <input
              className="w-full max-w-xs border border-slate-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Search applications…"
              value={appSearch}
              onChange={(e) => setAppSearch(e.target.value)}
            />

            {/* List */}
            <div className="space-y-2">
              {filteredApps.length === 0 ? <EmptyState message="No applications found" /> : filteredApps.map((app) => (
                <div key={app.name} className="rounded-xl border border-slate-200 px-4 py-3 space-y-2">
                  {editingApp?.name === app.name ? (
                    <div className="grid sm:grid-cols-3 gap-2">
                      <input className="border rounded-lg px-3 py-2 text-sm" value={editingApp.url} onChange={(e) => setEditingApp({ ...editingApp, url: e.target.value })} placeholder="URL" />
                      <input className="border rounded-lg px-3 py-2 text-sm" value={editingApp.description ?? ''} onChange={(e) => setEditingApp({ ...editingApp, description: e.target.value })} placeholder="Description" />
                      <input className="border rounded-lg px-3 py-2 text-sm" value={editingApp.openapi_path} onChange={(e) => setEditingApp({ ...editingApp, openapi_path: e.target.value })} placeholder="OpenAPI path" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void saveEditApp(editingApp)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingApp(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900">{app.name}</p>
                        <p className="text-xs text-slate-500 truncate">{app.url} · <span className="font-mono">{app.openapi_path}</span></p>
                        {app.description && <p className="text-xs text-slate-400 mt-0.5">{app.description}</p>}
                        {app.is_deleted && <span className="text-xs text-red-500 mt-0.5 inline-block">⚠ soft-deleted</span>}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-1 rounded-full ${(app.is_enabled ?? true) ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {(app.is_enabled ?? true) ? 'enabled' : 'disabled'}
                        </span>
                        {canManageApps && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => void patchApp(app, { is_enabled: !(app.is_enabled ?? true) })}>Toggle</Button>
                            <Button size="sm" variant="secondary" onClick={() => setEditingApp({ ...app })}>Edit</Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteApp(app, false)}>Soft Delete</Button>
                            {canHardDelete && <Button size="sm" variant="ghost" onClick={() => deleteApp(app, true)}>Hard Delete</Button>}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── SERVERS TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'servers' && (
          <section className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-semibold text-slate-900">MCP Servers</h2>
              {!canManageServers && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Read-only</span>}
            </div>

            {canManageServers && (
              <details className="group rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 p-4">
                <summary className="cursor-pointer text-sm font-medium text-emerald-700 group-open:mb-4 list-none flex items-center gap-2">
                  <span className="text-lg leading-none">＋</span> Register New MCP Server
                </summary>
                <div className="grid sm:grid-cols-3 gap-3">
                  <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Name *" value={serverForm.name} onChange={(e) => setServerForm({ ...serverForm, name: e.target.value })} />
                  <input className="border rounded-lg px-3 py-2 text-sm" placeholder="URL *" value={serverForm.url} onChange={(e) => setServerForm({ ...serverForm, url: e.target.value })} />
                  <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Description" value={serverForm.description} onChange={(e) => setServerForm({ ...serverForm, description: e.target.value })} />
                  <Button disabled={!serverForm.name || !serverForm.url} onClick={() => void createServer()}>Register Server</Button>
                </div>
              </details>
            )}

            <input className="w-full max-w-xs border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Search servers…" value={serverSearch} onChange={(e) => setServerSearch(e.target.value)} />

            <div className="space-y-2">
              {filteredServers.length === 0 ? <EmptyState message="No servers found" /> : filteredServers.map((server) => (
                <div key={server.name} className="rounded-xl border border-slate-200 px-4 py-3">
                  {editingServer?.name === server.name ? (
                    <div className="grid sm:grid-cols-3 gap-2">
                      <input className="border rounded-lg px-3 py-2 text-sm" value={editingServer.url} onChange={(e) => setEditingServer({ ...editingServer, url: e.target.value })} placeholder="URL" />
                      <input className="border rounded-lg px-3 py-2 text-sm" value={editingServer.description ?? ''} onChange={(e) => setEditingServer({ ...editingServer, description: e.target.value })} placeholder="Description" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void saveEditServer(editingServer)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingServer(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900">{server.name}</p>
                        <p className="text-xs text-slate-500 truncate">{server.url}</p>
                        {server.description && <p className="text-xs text-slate-400 mt-0.5">{server.description}</p>}
                        {server.is_deleted && <span className="text-xs text-red-500 mt-0.5 inline-block">⚠ soft-deleted</span>}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-1 rounded-full ${(server.is_enabled ?? true) ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {(server.is_enabled ?? true) ? 'enabled' : 'disabled'}
                        </span>
                        {canManageServers && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => void patchServer(server, { is_enabled: !(server.is_enabled ?? true) })}>Toggle</Button>
                            <Button size="sm" variant="secondary" onClick={() => setEditingServer({ ...server })}>Edit</Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteServer(server, false)}>Soft Delete</Button>
                            {canHardDelete && <Button size="sm" variant="ghost" onClick={() => deleteServer(server, true)}>Hard Delete</Button>}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── TOOLS TAB ────────────────────────────────────────────────────── */}
        {activeTab === 'tools' && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-semibold text-slate-900">Tools</h2>
              {!canManageTools && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Read-only</span>}
            </div>

            {/* Create Tool form — commented out, not needed right now
            {canManageTools && (
              <details className="group rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4">
                <summary className="cursor-pointer text-sm font-medium text-slate-700 group-open:mb-4 list-none flex items-center gap-2">
                  <span className="text-lg leading-none">＋</span> Create Tool
                </summary>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <input className="border rounded-lg px-3 py-2 text-sm" placeholder="owner_id" value={toolForm.owner_id} ... />
                  <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Tool name *" ... />
                  ...
                </div>
              </details>
            )}
            */}

            <input className="w-full max-w-xs border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Search tools…" value={toolSearch} onChange={(e) => setToolSearch(e.target.value)} />

            <div className="space-y-2">
              {filteredTools.length === 0 ? <EmptyState message="No tools found" /> : filteredTools.map((tool) => {
                const isEditingDesc = tool.id in toolDescEdits;
                const draftDesc = toolDescEdits[tool.id] ?? tool.description;
                return (
                  <div key={tool.id} className="rounded-xl border border-slate-200 px-4 py-3 space-y-2.5">
                    {/* Top row: identity + toggle */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm text-slate-900">{tool.name}</p>
                          <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{tool.source_type}</span>
                          <span className="text-xs text-slate-400 font-mono">v{tool.current_version}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{tool.owner_id}</p>
                        {tool.method && tool.path && (
                          <p className="text-xs mt-1 flex items-center gap-1">
                            <span className={`font-mono px-1.5 py-0.5 rounded ${METHOD_COLORS[tool.method] ?? 'bg-slate-100 text-slate-600'}`}>{tool.method}</span>
                            <span className="text-slate-500 font-mono">{tool.path}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${tool.is_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {tool.is_enabled ? 'enabled' : 'disabled'}
                        </span>
                        {canManageTools && (
                          <Button size="sm" variant="secondary" onClick={() => void toggleToolEnabled(tool)}>Toggle</Button>
                        )}
                      </div>
                    </div>

                    {/* Description row */}
                    <div className="flex items-start gap-2">
                      {isEditingDesc ? (
                        <>
                          <textarea
                            rows={2}
                            className="flex-1 border border-cyan-300 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-cyan-200"
                            value={draftDesc}
                            onChange={(e) => setToolDescEdits((prev) => ({ ...prev, [tool.id]: e.target.value }))}
                            placeholder="Enter description…"
                            autoFocus
                          />
                          <div className="flex flex-col gap-1">
                            <Button size="sm" onClick={() => void saveToolDescription(tool)}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setToolDescEdits((prev) => { const n = { ...prev }; delete n[tool.id]; return n; })}>Cancel</Button>
                          </div>
                        </>
                      ) : (
                        <div
                          className={`flex-1 text-xs rounded-lg px-3 py-2 min-h-[2rem] ${canManageTools ? 'cursor-pointer hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors group' : ''} ${tool.description ? 'text-slate-500' : 'text-slate-300 italic'}`}
                          onClick={() => canManageTools && setToolDescEdits((prev) => ({ ...prev, [tool.id]: tool.description }))}
                          title={canManageTools ? 'Click to edit description' : undefined}
                        >
                          {tool.description || (canManageTools ? 'Click to add description…' : 'No description')}
                          {canManageTools && <span className="ml-1.5 opacity-0 group-hover:opacity-60 text-slate-400 text-xs">✎</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── ENDPOINTS TAB ────────────────────────────────────────────────── */}
        {activeTab === 'endpoints' && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-semibold text-slate-900">API Endpoints</h2>
              {!canManageEndpoints && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Read-only</span>}
            </div>

            {/* Register Endpoint form — commented out, not needed right now
            {canManageEndpoints && (
              <details className="group rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4">
                <summary className="cursor-pointer text-sm font-medium text-slate-700 group-open:mb-4 list-none flex items-center gap-2">
                  <span className="text-lg leading-none">＋</span> Register Endpoint
                </summary>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <input placeholder="owner_id" ... />
                  <select placeholder="method" ... />
                  <input placeholder="/path *" ... />
                  <input placeholder="Description" ... />
                  <input placeholder="Version" ... />
                  <label>Expose to MCP ...</label>
                  <label>Pre-approve exposure ...</label>
                  <Button>Register</Button>
                </div>
              </details>
            )}
            */}

            <input className="w-full max-w-xs border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Search endpoints…" value={endpointSearch} onChange={(e) => setEndpointSearch(e.target.value)} />

            <div className="space-y-2">
              {filteredEndpoints.length === 0 ? <EmptyState message="No endpoints found" /> : filteredEndpoints.map((ep) => {
                const isEditingDesc = ep.id in endpointDescEdits;
                const draftDesc = endpointDescEdits[ep.id] ?? ep.description;
                return (
                  <div key={ep.id} className="rounded-xl border border-slate-200 px-4 py-3 space-y-2.5">
                    {/* Top row: identity + exposure controls */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-mono text-xs px-2 py-0.5 rounded font-semibold ${METHOD_COLORS[ep.method] ?? 'bg-slate-100 text-slate-600'}`}>{ep.method}</span>
                          <span className="font-mono text-sm text-slate-900">{ep.path}</span>
                          <span className="text-xs text-slate-400">v{ep.current_version}</span>
                          {ep.mcp_tool_id && (
                            <span className="text-xs bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded font-mono">tool #{ep.mcp_tool_id}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{ep.owner_id}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-1 rounded-full ${ep.exposed_to_mcp ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                          {ep.exposed_to_mcp ? 'exposed' : 'hidden'}
                        </span>
                        {ep.exposed_to_mcp && (
                          <span className={`text-xs px-2 py-1 rounded-full ${ep.exposure_approved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {ep.exposure_approved ? 'approved' : 'pending'}
                          </span>
                        )}
                        {canManageEndpoints && (
                          <Button size="sm" variant="secondary" onClick={() => void toggleEndpointExposure(ep)}>
                            {ep.exposed_to_mcp ? 'Hide' : 'Expose'}
                          </Button>
                        )}
                        {ep.exposed_to_mcp && !ep.exposure_approved && canApproveExposure && (
                          <Button size="sm" variant="primary" onClick={() => void approveEndpointExposure(ep)}>Approve</Button>
                        )}
                        {ep.exposed_to_mcp && ep.exposure_approved && canApproveExposure && (
                          <Button size="sm" variant="ghost" onClick={() => void approveEndpointExposure(ep)}>Revoke</Button>
                        )}
                      </div>
                    </div>

                    {/* Description row */}
                    <div className="flex items-start gap-2">
                      {isEditingDesc ? (
                        <>
                          <textarea
                            rows={2}
                            className="flex-1 border border-cyan-300 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-cyan-200"
                            value={draftDesc}
                            onChange={(e) => setEndpointDescEdits((prev) => ({ ...prev, [ep.id]: e.target.value }))}
                            placeholder="Enter description…"
                            autoFocus
                          />
                          <div className="flex flex-col gap-1">
                            <Button size="sm" onClick={() => void saveEndpointDescription(ep)}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEndpointDescEdits((prev) => { const n = { ...prev }; delete n[ep.id]; return n; })}>Cancel</Button>
                          </div>
                        </>
                      ) : (
                        <div
                          className={`flex-1 text-xs rounded-lg px-3 py-2 min-h-[2rem] ${canManageEndpoints ? 'cursor-pointer hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors group' : ''} ${ep.description ? 'text-slate-500' : 'text-slate-300 italic'}`}
                          onClick={() => canManageEndpoints && setEndpointDescEdits((prev) => ({ ...prev, [ep.id]: ep.description }))}
                          title={canManageEndpoints ? 'Click to edit description' : undefined}
                        >
                          {ep.description || (canManageEndpoints ? 'Click to add description…' : 'No description')}
                          {canManageEndpoints && <span className="ml-1.5 opacity-0 group-hover:opacity-60 text-slate-400 text-xs">✎</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── AUDIT LOGS TAB ───────────────────────────────────────────────── */}
        {activeTab === 'audit' && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">Audit Logs</h2>

            <div className="flex items-center gap-3 flex-wrap">
              <input
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Filter by actor, action, resource…"
                value={auditSearch}
                onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1); }}
              />
              <span className="text-xs text-slate-400">{filteredAuditLogs.total} entries</span>
            </div>

            <div className="rounded-xl border border-slate-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2.5">When</th>
                    <th className="text-left px-4 py-2.5">Actor</th>
                    <th className="text-left px-4 py-2.5">Action</th>
                    <th className="text-left px-4 py-2.5">Resource</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAuditLogs.page.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-10 text-slate-400">No logs found</td></tr>
                  ) : filteredAuditLogs.page.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{log.created_on ?? '—'}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{log.actor}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                          log.action.includes('delete') ? 'bg-red-100 text-red-700' :
                          log.action.includes('create') ? 'bg-emerald-100 text-emerald-700' :
                          log.action.includes('update') || log.action.includes('patch') ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>{log.action}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{log.resource_type}:{log.resource_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filteredAuditLogs.total > AUDIT_PAGE_SIZE && (
              <div className="flex items-center justify-between text-sm pt-1">
                <span className="text-slate-500">
                  Page {auditPage} of {Math.ceil(filteredAuditLogs.total / AUDIT_PAGE_SIZE)}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={auditPage === 1} onClick={() => setAuditPage((p) => p - 1)}>← Prev</Button>
                  <Button size="sm" variant="secondary" disabled={auditPage >= Math.ceil(filteredAuditLogs.total / AUDIT_PAGE_SIZE)} onClick={() => setAuditPage((p) => p + 1)}>Next →</Button>
                </div>
              </div>
            )}
          </section>
        )}

      </main>
    </div>
  );
}
