'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Navigation from '@/components/Navigation';
import Button from '@/components/ui/Button';
import { http } from '@/services/http';

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

type DashboardStatsResponse = { cards: DashboardCards };

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

export default function AdminPanelPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actorUser, setActorUser] = useState('admin');
  const [actorRole, setActorRole] = useState<Role>('super_admin');

  const [stats, setStats] = useState<DashboardCards | null>(null);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [appForm, setAppForm] = useState({
    name: '',
    url: '',
    description: '',
    openapi_path: '/openapi.json',
    include_unreachable_tools: false,
  });
  const [serverForm, setServerForm] = useState({
    name: '',
    url: '',
    description: '',
  });
  const [toolForm, setToolForm] = useState({
    owner_id: 'app:',
    name: '',
    description: '',
    version: '1.0.0',
    source_type: 'openapi',
  });
  const [endpointForm, setEndpointForm] = useState({
    owner_id: 'app:',
    method: 'GET',
    path: '',
    description: '',
    version: '1.0.0',
    exposed_to_mcp: false,
    exposure_approved: false,
  });

  const canManageApps = useMemo(() => ['super_admin', 'admin'].includes(actorRole), [actorRole]);
  const canManageServers = useMemo(() => ['super_admin', 'admin'].includes(actorRole), [actorRole]);
  const canManageTools = useMemo(() => ['super_admin', 'admin', 'operator'].includes(actorRole), [actorRole]);
  const canManageEndpoints = useMemo(() => ['super_admin', 'admin', 'operator'].includes(actorRole), [actorRole]);
  const canHardDelete = useMemo(() => actorRole === 'super_admin', [actorRole]);
  const canViewAudit = useMemo(() => ['super_admin', 'admin', 'operator', 'read_only'].includes(actorRole), [actorRole]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedUser = window.localStorage.getItem('mcp_admin_user');
    const storedRoles = window.localStorage.getItem('mcp_admin_roles');
    if (storedUser) setActorUser(storedUser);
    if (storedRoles && ['super_admin', 'admin', 'operator', 'read_only'].includes(storedRoles)) {
      setActorRole(storedRoles as Role);
    }
  }, []);

  const syncActorToStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('mcp_admin_user', actorUser.trim() || 'admin');
    window.localStorage.setItem('mcp_admin_roles', actorRole);
  }, [actorRole, actorUser]);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [statsRes, appsRes, serversRes, toolsRes, endpointsRes, auditRes] = await Promise.all([
        http<DashboardStatsResponse>('/dashboard/stats'),
        http<{ base_urls: AppItem[] }>('/base-urls'),
        http<{ servers: ServerItem[] }>('/servers'),
        http<{ tools: Tool[] }>('/tools'),
        http<{ endpoints: Endpoint[] }>('/endpoints'),
        http<{ logs: AuditLog[] }>('/audit-logs?limit=100'),
      ]);
      setStats(statsRes.cards);
      setApps(appsRes.base_urls || []);
      setServers(serversRes.servers || []);
      setTools(toolsRes.tools || []);
      setEndpoints(endpointsRes.endpoints || []);
      setAuditLogs(auditRes.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin panel data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    syncActorToStorage();
    void fetchAll();
  }, [fetchAll, syncActorToStorage]);

  const createApp = async () => {
    if (!canManageApps) return;
    await http('/register-base-url', {
      method: 'POST',
      body: JSON.stringify(appForm),
    });
    setAppForm({ name: '', url: '', description: '', openapi_path: '/openapi.json', include_unreachable_tools: false });
    await fetchAll();
  };

  const patchApp = async (app: AppItem, patch: Record<string, unknown>) => {
    if (!canManageApps) return;
    await http(`/base-urls/${encodeURIComponent(app.name)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    await fetchAll();
  };

  const deleteApp = async (app: AppItem, hard: boolean) => {
    if (!canManageApps) return;
    await http(`/base-urls/${encodeURIComponent(app.name)}?hard=${hard ? 'true' : 'false'}`, {
      method: 'DELETE',
    });
    await fetchAll();
  };

  const createServer = async () => {
    if (!canManageServers) return;
    await http('/register-server', {
      method: 'POST',
      body: JSON.stringify(serverForm),
    });
    setServerForm({ name: '', url: '', description: '' });
    await fetchAll();
  };

  const patchServer = async (server: ServerItem, patch: Record<string, unknown>) => {
    if (!canManageServers) return;
    await http(`/servers/${encodeURIComponent(server.name)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    await fetchAll();
  };

  const deleteServer = async (server: ServerItem, hard: boolean) => {
    if (!canManageServers) return;
    await http(`/servers/${encodeURIComponent(server.name)}?hard=${hard ? 'true' : 'false'}`, {
      method: 'DELETE',
    });
    await fetchAll();
  };

  const createTool = async () => {
    if (!canManageTools) return;
    await http('/tools', {
      method: 'POST',
      body: JSON.stringify({ ...toolForm, description: toolForm.description.trim() }),
    });
    setToolForm((prev) => ({ ...prev, name: '', description: '' }));
    await fetchAll();
  };

  const toggleToolEnabled = async (tool: Tool) => {
    if (!canManageTools) return;
    await http(`/tools/${tool.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_enabled: !tool.is_enabled }),
    });
    await fetchAll();
  };

  const createEndpoint = async () => {
    if (!canManageEndpoints) return;
    await http('/endpoints', {
      method: 'POST',
      body: JSON.stringify({ ...endpointForm, description: endpointForm.description.trim() }),
    });
    setEndpointForm((prev) => ({ ...prev, path: '', description: '' }));
    await fetchAll();
  };

  const toggleEndpointExposure = async (endpoint: Endpoint) => {
    if (!canManageEndpoints) return;
    const nextApproved = endpoint.exposed_to_mcp ? endpoint.exposure_approved : true;
    await http(`/endpoints/${endpoint.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ exposed_to_mcp: !endpoint.exposed_to_mcp, exposure_approved: nextApproved }),
    });
    await fetchAll();
  };

  const cards = stats
    ? [
      ['Total Applications', stats.total_applications],
      ['Applications Alive', stats.applications_alive],
      ['Applications Down', stats.applications_down],
      ['Total MCP Servers', stats.total_mcp_servers],
      ['MCP Servers Alive', stats.mcp_servers_alive],
      ['MCP Servers Down', stats.mcp_servers_down],
      ['Total Tools', stats.total_tools],
      ['Total API Endpoints', stats.total_api_endpoints],
    ]
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/40 to-amber-50/60">
      <Navigation pageTitle="Admin Panel" />
      <main className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-700 to-amber-700 bg-clip-text text-transparent">Admin Control Plane</h1>
            <p className="text-sm text-slate-600 mt-1">Full governance for Applications, MCP Servers, Tools, Endpoints, and audit.</p>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Actor</label>
              <input value={actorUser} onChange={(e) => setActorUser(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Role</label>
              <select value={actorRole} onChange={(e) => setActorRole(e.target.value as Role)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="super_admin">super_admin</option>
                <option value="admin">admin</option>
                <option value="operator">operator</option>
                <option value="read_only">read_only</option>
              </select>
            </div>
            <Button variant="primary" onClick={() => void fetchAll()}>Refresh</Button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3">{error}</div>}
        {loading && <div className="text-slate-500">Loading admin data...</div>}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{String(value)}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-cyan-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Applications CRUD</h2>
            {!canManageApps && <span className="text-xs text-amber-600">Read-only for current role</span>}
          </div>
          <div className="grid md:grid-cols-6 gap-2">
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="name" value={appForm.name} onChange={(e) => setAppForm({ ...appForm, name: e.target.value })} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="url" value={appForm.url} onChange={(e) => setAppForm({ ...appForm, url: e.target.value })} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="description" value={appForm.description} onChange={(e) => setAppForm({ ...appForm, description: e.target.value })} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="openapi_path" value={appForm.openapi_path} onChange={(e) => setAppForm({ ...appForm, openapi_path: e.target.value })} />
            <label className="flex items-center gap-2 text-xs text-slate-600 px-2">
              <input type="checkbox" checked={appForm.include_unreachable_tools} onChange={(e) => setAppForm({ ...appForm, include_unreachable_tools: e.target.checked })} />
              include unreachable
            </label>
            <Button disabled={!canManageApps} onClick={() => void createApp()}>Create App</Button>
          </div>
          <div className="space-y-2">
            {apps.map((app) => (
              <div key={app.name} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-slate-900 truncate">{app.name}</p>
                  <p className="text-xs text-slate-500 truncate">{app.url} ({app.openapi_path || '/openapi.json'})</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${(app.is_enabled ?? true) ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{(app.is_enabled ?? true) ? 'enabled' : 'disabled'}</span>
                  <Button size="sm" variant="secondary" disabled={!canManageApps} onClick={() => void patchApp(app, { is_enabled: !(app.is_enabled ?? true) })}>Toggle</Button>
                  <Button size="sm" variant="ghost" disabled={!canManageApps} onClick={() => void deleteApp(app, false)}>Soft Delete</Button>
                  <Button size="sm" variant="ghost" disabled={!canManageApps || !canHardDelete} onClick={() => void deleteApp(app, true)}>Hard Delete</Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">MCP Servers CRUD</h2>
            {!canManageServers && <span className="text-xs text-amber-600">Read-only for current role</span>}
          </div>
          <div className="grid md:grid-cols-4 gap-2">
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="name" value={serverForm.name} onChange={(e) => setServerForm({ ...serverForm, name: e.target.value })} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="url" value={serverForm.url} onChange={(e) => setServerForm({ ...serverForm, url: e.target.value })} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="description" value={serverForm.description} onChange={(e) => setServerForm({ ...serverForm, description: e.target.value })} />
            <Button disabled={!canManageServers} onClick={() => void createServer()}>Create Server</Button>
          </div>
          <div className="space-y-2">
            {servers.map((server) => (
              <div key={server.name} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-slate-900 truncate">{server.name}</p>
                  <p className="text-xs text-slate-500 truncate">{server.url}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${(server.is_enabled ?? true) ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{(server.is_enabled ?? true) ? 'enabled' : 'disabled'}</span>
                  <Button size="sm" variant="secondary" disabled={!canManageServers} onClick={() => void patchServer(server, { is_enabled: !(server.is_enabled ?? true) })}>Toggle</Button>
                  <Button size="sm" variant="ghost" disabled={!canManageServers} onClick={() => void deleteServer(server, false)}>Soft Delete</Button>
                  <Button size="sm" variant="ghost" disabled={!canManageServers || !canHardDelete} onClick={() => void deleteServer(server, true)}>Hard Delete</Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Tools</h2>
            {!canManageTools && <span className="text-xs text-amber-600">Read-only for current role</span>}
          </div>
          <div className="grid md:grid-cols-5 gap-2">
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="owner_id" value={toolForm.owner_id} onChange={(e) => setToolForm({ ...toolForm, owner_id: e.target.value })} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="name" value={toolForm.name} onChange={(e) => setToolForm({ ...toolForm, name: e.target.value })} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="description" value={toolForm.description} onChange={(e) => setToolForm({ ...toolForm, description: e.target.value })} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="version" value={toolForm.version} onChange={(e) => setToolForm({ ...toolForm, version: e.target.value })} />
            <Button disabled={!canManageTools} onClick={() => void createTool()}>Create Tool</Button>
          </div>
          <div className="space-y-2">
            {tools.map((tool) => (
              <div key={tool.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-slate-900 truncate">{tool.owner_id} :: {tool.name}</p>
                  <p className="text-xs text-slate-500 truncate">{tool.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${tool.is_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{tool.is_enabled ? 'enabled' : 'disabled'}</span>
                  <Button size="sm" variant="secondary" disabled={!canManageTools} onClick={() => void toggleToolEnabled(tool)}>Toggle</Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">API Endpoints</h2>
            {!canManageEndpoints && <span className="text-xs text-amber-600">Read-only for current role</span>}
          </div>
          <div className="grid md:grid-cols-7 gap-2">
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="owner_id" value={endpointForm.owner_id} onChange={(e) => setEndpointForm({ ...endpointForm, owner_id: e.target.value })} />
            <select className="border rounded-lg px-3 py-2 text-sm" value={endpointForm.method} onChange={(e) => setEndpointForm({ ...endpointForm, method: e.target.value })}>
              <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
            </select>
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="/path" value={endpointForm.path} onChange={(e) => setEndpointForm({ ...endpointForm, path: e.target.value })} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="description" value={endpointForm.description} onChange={(e) => setEndpointForm({ ...endpointForm, description: e.target.value })} />
            <label className="flex items-center gap-2 text-xs text-slate-600 px-2"><input type="checkbox" checked={endpointForm.exposed_to_mcp} onChange={(e) => setEndpointForm({ ...endpointForm, exposed_to_mcp: e.target.checked })} />expose</label>
            <label className="flex items-center gap-2 text-xs text-slate-600 px-2"><input type="checkbox" checked={endpointForm.exposure_approved} onChange={(e) => setEndpointForm({ ...endpointForm, exposure_approved: e.target.checked })} />approved</label>
            <Button disabled={!canManageEndpoints} onClick={() => void createEndpoint()}>Create Endpoint</Button>
          </div>
          <div className="space-y-2">
            {endpoints.map((ep) => (
              <div key={ep.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <div>
                  <p className="font-medium text-sm text-slate-900">{ep.owner_id} :: {ep.method} {ep.path}</p>
                  <p className="text-xs text-slate-500">{ep.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${ep.exposed_to_mcp ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>{ep.exposed_to_mcp ? 'exposed' : 'hidden'}</span>
                  <Button size="sm" variant="secondary" disabled={!canManageEndpoints} onClick={() => void toggleEndpointExposure(ep)}>Toggle Exposure</Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {canViewAudit && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">Audit Logs</h2>
            <div className="max-h-96 overflow-auto border border-slate-100 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">When</th>
                    <th className="text-left px-3 py-2">Actor</th>
                    <th className="text-left px-3 py-2">Action</th>
                    <th className="text-left px-3 py-2">Resource</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-500">{log.created_on || '-'}</td>
                      <td className="px-3 py-2">{log.actor}</td>
                      <td className="px-3 py-2">{log.action}</td>
                      <td className="px-3 py-2">{log.resource_type}:{log.resource_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
