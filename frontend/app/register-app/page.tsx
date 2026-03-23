'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Navigation from '@/components/Navigation';
import { publicEnv } from '@/lib/env';
import { http, authenticatedFetch } from '@/services/http';

const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL;

type DomainType = 'ADM' | 'OPS';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' | 'trace';

interface AppItem {
  name: string;
  url: string;
  description?: string;
  domain_type?: DomainType;
  openapi_path?: string;
  selected_endpoints?: string[];
  include_unreachable_tools?: boolean;
  is_enabled?: boolean;
  is_deleted?: boolean;
}

interface DiscoveredEndpoint {
  id: string;
  method: string;
  path: string;
  operationId: string;
  summary: string;
  description: string;
  parameters: unknown[];
  requestBody: unknown;
  responses: unknown;
}

interface ModalEndpoint {
  id: string;
  method: string;
  path: string;
  description: string;
  parameters: unknown[];
  requestBody: unknown;
  responses: unknown;
  db_id?: number;
  current_version?: string;
  is_enabled: boolean;
}

const HTTP_METHODS: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function buildEndpointsFromOpenApi(spec: Record<string, unknown>): DiscoveredEndpoint[] {
  const paths = (spec?.paths as Record<string, Record<string, unknown>>) || {};
  const items: DiscoveredEndpoint[] = [];

  for (const [path, methods] of Object.entries(paths)) {
    const methodEntries = Object.entries((methods || {}) as Record<string, unknown>);
    for (const [rawMethod, rawOp] of methodEntries) {
      const method = String(rawMethod || '').toLowerCase() as HttpMethod;
      if (!HTTP_METHODS.includes(method)) continue;
      const op = rawOp as Record<string, unknown> | undefined;
      if (!op || typeof op !== 'object') continue;
      const operationId = String(op.operationId || `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`);
      items.push({
        id: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        operationId,
        summary: String(op.summary || ''),
        description: String(op.description || ''),
        parameters: Array.isArray(op.parameters) ? op.parameters : [],
        requestBody: op.requestBody || null,
        responses: op.responses || {},
      });
    }
  }

  return items.sort((a, b) => a.id.localeCompare(b.id));
}

export default function RegisterAppPage() {
  const DISCOVERY_PAGE_SIZE = 10;
  const REGISTERED_PAGE_SIZE = 10;
  const [apps, setApps] = useState<AppItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    url: '',
    description: '',
    openapi_path: '',
    include_unreachable_tools: false,
    domain_type: 'ADM' as DomainType,
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredEndpoints, setDiscoveredEndpoints] = useState<DiscoveredEndpoint[]>([]);
  const [selectedEndpoints, setSelectedEndpoints] = useState<Set<string>>(new Set());
  const [activeEndpointId, setActiveEndpointId] = useState<string | null>(null);
  const [selectedAppName, setSelectedAppName] = useState<string | null>(null);
  const [registeredEndpoints, setRegisteredEndpoints] = useState<ModalEndpoint[]>([]);
  const [registeredEndpointsLoading, setRegisteredEndpointsLoading] = useState(false);
  const [registeredEndpointsError, setRegisteredEndpointsError] = useState<string | null>(null);
  const [draftEndpointDescriptions, setDraftEndpointDescriptions] = useState<Record<string, string>>({});
  const [savingEndpointDescriptionId, setSavingEndpointDescriptionId] = useState<string | null>(null);
  const [selectedEndpointDescriptions, setSelectedEndpointDescriptions] = useState<Record<string, string>>({});
  const [generatingEndpointDescriptionId, setGeneratingEndpointDescriptionId] = useState<string | null>(null);
  const [generatingRegisteredDescriptionId, setGeneratingRegisteredDescriptionId] = useState<string | null>(null);
  const [llmModels, setLlmModels] = useState<string[]>([]);
  const [llmModel, setLlmModel] = useState<string>('');
  const [llmModelError, setLlmModelError] = useState<string | null>(null);
  const [discoveryPage, setDiscoveryPage] = useState(1);
  const [registeredSyncing, setRegisteredSyncing] = useState(false);
  const [registeredPage, setRegisteredPage] = useState(1);
  const [registeredSelectedEndpoints, setRegisteredSelectedEndpoints] = useState<Set<string>>(new Set());

  const activeEndpoint = useMemo(
    () => discoveredEndpoints.find((endpoint) => endpoint.id === activeEndpointId) ?? null,
    [activeEndpointId, discoveredEndpoints]
  );
  const discoveryTotalPages = Math.max(1, Math.ceil(discoveredEndpoints.length / DISCOVERY_PAGE_SIZE));
  const discoveryPageItems = useMemo(() => {
    const start = (discoveryPage - 1) * DISCOVERY_PAGE_SIZE;
    return discoveredEndpoints.slice(start, start + DISCOVERY_PAGE_SIZE);
  }, [discoveredEndpoints, discoveryPage]);
  const registeredTotalPages = Math.max(1, Math.ceil(registeredEndpoints.length / REGISTERED_PAGE_SIZE));
  const registeredPageItems = useMemo(() => {
    const start = (registeredPage - 1) * REGISTERED_PAGE_SIZE;
    return registeredEndpoints.slice(start, start + REGISTERED_PAGE_SIZE);
  }, [registeredEndpoints, registeredPage]);
  const activeRegisteredEndpoint = useMemo(
    () => registeredEndpoints.find((endpoint) => endpoint.id === activeEndpointId) ?? null,
    [registeredEndpoints, activeEndpointId]
  );

  const fetchApps = async () => {
    try {
      const response = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/base-urls?include_inactive=true`);
      const payload = await response.json();
      setApps(Array.isArray(payload?.base_urls) ? payload.base_urls : []);
    } catch {
      setApps([]);
    }
  };

  useEffect(() => {
    void fetchApps();
  }, []);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/agent/models`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.detail || `HTTP ${response.status}`);
        }
        const modelList = Array.isArray(payload.models) ? payload.models : [];
        setLlmModels(modelList);
        setLlmModel(payload.default_model || modelList[0] || '');
        setLlmModelError(null);
      } catch (err) {
        console.error('Failed to load LLM models:', err);
        setLlmModelError(err instanceof Error ? err.message : 'Failed to load models');
      }
    };

    if (NEXT_PUBLIC_BE_API_URL) {
      void loadModels();
    }
  }, []);

  const onChangeInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
    setError(null);
    setSuccess(null);
  };

  const onChangeDomain = (domain: DomainType) => {
    setFormData((prev) => ({ ...prev, domain_type: domain }));
    setError(null);
  };

  const fetchApis = async () => {
    setError(null);
    setSuccess(null);
    if (!formData.name.trim() || !formData.url.trim()) {
      setError('Name and URL are required before fetching APIs.');
      return;
    }

    setDiscovering(true);
    try {
      const params = new URLSearchParams({ url: formData.url.trim() });
      if (formData.openapi_path.trim()) {
        params.set('openapi_path', formData.openapi_path.trim());
      }
      if (formData.domain_type) {
        params.set('domain_type', formData.domain_type);
      }
      const response = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/openapi-spec?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403 || payload?.detail?.includes('Keycloak')) {
          throw new Error(`Failed to authenticate with the ${formData.domain_type} Keycloak network to retrieve the OpenAPI spec. Check backend configurations.`);
        }
        throw new Error(payload?.detail || 'Failed to fetch OpenAPI specification');
      }

      const spec =
        (payload?.spec as Record<string, unknown>) ||
        (payload as Record<string, unknown>) ||
        {};
      const endpoints = buildEndpointsFromOpenApi(spec);
      setDiscoveredEndpoints(endpoints);
      const descriptionMap: Record<string, string> = {};
      endpoints.forEach((endpoint) => {
        descriptionMap[endpoint.id] = endpoint.summary || endpoint.description || '';
      });
      setSelectedEndpointDescriptions(descriptionMap);
      const initial = new Set<string>(endpoints.map((endpoint) => endpoint.id));
      setSelectedEndpoints(initial);
      setActiveEndpointId(endpoints[0]?.id ?? null);
      setDiscoveryPage(1);
      setIsModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch APIs');
    } finally {
      setDiscovering(false);
    }
  };

  const toggleEndpoint = (endpointId: string) => {
    setSelectedEndpoints((prev) => {
      const next = new Set(prev);
      if (next.has(endpointId)) {
        next.delete(endpointId);
      } else {
        next.add(endpointId);
      }
      return next;
    });
  };

  const setSelectedEndpointDescription = (endpointId: string, description: string) => {
    setSelectedEndpointDescriptions((prev) => ({ ...prev, [endpointId]: description }));
  };

  const generateEndpointDescription = async (endpoint: DiscoveredEndpoint) => {
    if (!formData.name.trim()) {
      setError('Set an application name before generating descriptions.');
      return;
    }
    setGeneratingEndpointDescriptionId(endpoint.id);
    setError(null);
    try {
      if (!llmModel) {
        throw new Error('Select a model before generating descriptions.');
      }
      const prompt = [
        `You are helping document an API.`,
        `App name: ${formData.name.trim()}`,
        `App description: ${formData.description.trim() || 'N/A'}`,
        `Endpoint: ${endpoint.method} ${endpoint.path}`,
        `Summary: ${endpoint.summary || 'N/A'}`,
        `Current description: ${(selectedEndpointDescriptions[endpoint.id] ?? endpoint.description) || 'N/A'}`,
        `Generate a precise description for this endpoint that will be used as an MCP tool description.`,
        `It should help an LLM choose and call the tool correctly (include intent, inputs, and outcome).`,
        `Return 1-2 sentences only.`,
      ].join('\n');
      const response = await authenticatedFetch(
        `${NEXT_PUBLIC_BE_API_URL}/agent/query?prompt=${encodeURIComponent(prompt)}&model=${encodeURIComponent(llmModel)}`,
        { method: 'GET' }
      );
      const payload = await response.json().catch(() => ({}));
      const text = String(payload?.response || '').trim();
      if (text) {
        setSelectedEndpointDescription(endpoint.id, text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate description');
    } finally {
      setGeneratingEndpointDescriptionId(null);
    }
  };

  const generateRegisteredEndpointDescription = async (endpoint: ModalEndpoint) => {
    if (!selectedAppName) return;
    const app = apps.find((item) => item.name === selectedAppName);
    setGeneratingRegisteredDescriptionId(endpoint.id);
    setRegisteredEndpointsError(null);
    try {
      if (!llmModel) {
        throw new Error('Select a model before generating descriptions.');
      }
      const prompt = [
        `You are helping document an API.`,
        `App name: ${selectedAppName}`,
        `App description: ${(app?.description || '').trim() || 'N/A'}`,
        `Endpoint: ${endpoint.method} ${endpoint.path}`,
        `Current description: ${(draftEndpointDescriptions[endpoint.id] ?? endpoint.description) || 'N/A'}`,
        `Generate a precise description for this endpoint that will be used as an MCP tool description.`,
        `It should help an LLM choose and call the tool correctly (include intent, inputs, and outcome).`,
        `Return 1-2 sentences only.`,
      ].join('\n');
      const response = await authenticatedFetch(
        `${NEXT_PUBLIC_BE_API_URL}/agent/query?prompt=${encodeURIComponent(prompt)}&model=${encodeURIComponent(llmModel)}`,
        { method: 'GET' }
      );
      const payload = await response.json().catch(() => ({}));
      const text = String(payload?.response || '').trim();
      if (text) {
        setDraftEndpointDescriptions((prev) => ({ ...prev, [endpoint.id]: text }));
      }
    } catch (err) {
      setRegisteredEndpointsError(err instanceof Error ? err.message : 'Failed to generate description');
    } finally {
      setGeneratingRegisteredDescriptionId(null);
    }
  };

  const syncCatalog = async () => {
    await authenticatedFetch(
      `${NEXT_PUBLIC_BE_API_URL}/mcp/openapi/catalog?force_refresh=true&registry_only=false`
    ).catch(() => null);
  };

  const buildRegisteredEndpointRows = async (
    appName: string,
    appUrl: string,
    openapiPath?: string,
    configuredSelectionOverride?: Set<string>
  ): Promise<ModalEndpoint[]> => {
    const params = new URLSearchParams({ url: appUrl });
    if (openapiPath && openapiPath.trim()) {
      params.set('openapi_path', openapiPath.trim());
    }
    const specResponse = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/openapi-spec?${params.toString()}`);
    const specPayload = await specResponse.json().catch(() => ({}));
    if (!specResponse.ok) {
      throw new Error(specPayload?.detail || 'Failed to fetch live APIs');
    }
    const spec =
      (specPayload?.spec as Record<string, unknown>) ||
      (specPayload as Record<string, unknown>) ||
      {};
    const liveEndpoints = buildEndpointsFromOpenApi(spec);

    const app = apps.find((item) => item.name === appName);
    const configuredSelection = configuredSelectionOverride ?? (Array.isArray(app?.selected_endpoints)
      ? new Set((app?.selected_endpoints || []).map((item) => String(item).trim()).filter(Boolean))
      : new Set<string>());
    const allSelectedByDefault = configuredSelection.size === 0;

    const dbPayload = await http<{
      tools: Array<{
        id: number;
        owner_id: string;
        source_type: string;
        method?: string;
        path?: string;
        description: string;
        current_version?: string;
        is_enabled: boolean;
      }>
    }>('/tools?include_inactive=true');
    const dbByEndpointKey = new Map(
      (dbPayload.tools || [])
        .filter((tool) => tool.owner_id === `app:${appName}` && tool.source_type === 'openapi')
        .map((tool) => [`${(tool.method || '').toUpperCase()} ${tool.path || ''}`, tool] as const)
    );

    return liveEndpoints
      .map((endpoint) => {
        const key = `${endpoint.method} ${endpoint.path}`;
        const dbEndpoint = dbByEndpointKey.get(key);
        const isSelected = allSelectedByDefault ? true : configuredSelection.has(key);
        return {
          id: key,
          method: endpoint.method,
          path: endpoint.path,
          description: (dbEndpoint?.description || endpoint.summary || endpoint.description || '').trim(),
          parameters: endpoint.parameters,
          requestBody: endpoint.requestBody,
          responses: endpoint.responses,
          db_id: dbEndpoint?.id,
          current_version: dbEndpoint?.current_version || '1.0.0',
          is_enabled: isSelected && (dbEndpoint?.is_enabled ?? true),
        };
      })
      .sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
  };

  const loadRegisteredEndpoints = async (
    appName: string,
    appUrlOverride?: string,
    openapiPathOverride?: string,
    configuredSelectionOverride?: Set<string>
  ) => {
    setSelectedAppName(appName);
    setRegisteredEndpointsLoading(true);
    setRegisteredEndpointsError(null);
    try {
      const app = apps.find((item) => item.name === appName);
      const resolvedUrl = appUrlOverride || app?.url;
      if (!resolvedUrl) {
        throw new Error('Application URL is missing');
      }
      const resolvedOpenapiPath = openapiPathOverride ?? app?.openapi_path;
      const rows = await buildRegisteredEndpointRows(appName, resolvedUrl, resolvedOpenapiPath, configuredSelectionOverride);
      setRegisteredEndpoints(rows);
      setActiveEndpointId(rows[0]?.id ?? null);
      setRegisteredPage(1);
      setRegisteredSelectedEndpoints(new Set(rows.filter((endpoint) => endpoint.is_enabled).map((endpoint) => endpoint.id)));
      const drafts: Record<string, string> = {};
      rows.forEach((endpoint) => {
        drafts[endpoint.id] = endpoint.description || '';
      });
      setDraftEndpointDescriptions(drafts);
    } catch (err) {
      setRegisteredEndpoints([]);
      setRegisteredEndpointsError(err instanceof Error ? err.message : 'Failed to load registered endpoints');
    } finally {
      setRegisteredEndpointsLoading(false);
    }
  };

  const applyRegisteredEndpointSelection = async () => {
    if (!selectedAppName) return;
    setRegisteredSyncing(true);
    setRegisteredEndpointsError(null);
    try {
      const app = apps.find((item) => item.name === selectedAppName);
      if (!app?.url) throw new Error('Application not found');

      const selected = new Set(registeredSelectedEndpoints);
      setRegisteredEndpoints((prev) =>
        prev.map((row) => ({ ...row, is_enabled: selected.has(row.id) }))
      );

      await http(`/base-urls/${encodeURIComponent(selectedAppName)}`, {
        method: 'PATCH',
        body: JSON.stringify({ selected_endpoints: Array.from(selected) }),
      });
      await syncCatalog();
      await fetchApps();
      await loadRegisteredEndpoints(selectedAppName, app.url, app.openapi_path, selected);
    } catch (err) {
      setRegisteredEndpointsError(err instanceof Error ? err.message : 'Failed to apply endpoint selection');
      const app = apps.find((item) => item.name === selectedAppName);
      if (app?.url) {
        await loadRegisteredEndpoints(selectedAppName, app.url, app.openapi_path);
      }
    } finally {
      setRegisteredSyncing(false);
    }
  };

  const saveRegisteredEndpointDescription = async (endpoint: ModalEndpoint) => {
    if (!selectedAppName) return;
    const nextDescription = (draftEndpointDescriptions[endpoint.id] ?? '').trim();
    if (nextDescription === (endpoint.description || '')) return;
    setSavingEndpointDescriptionId(endpoint.id);
    setRegisteredEndpointsError(null);
    try {
      if (!endpoint.is_enabled) {
        throw new Error('Enable the endpoint first, then save description.');
      }

      await syncCatalog();
      const payload = await http<{
        tools: Array<{
          id: number;
          owner_id: string;
          source_type: string;
          method?: string;
          path?: string;
          current_version?: string;
        }>
      }>('/tools?include_inactive=true');
      const dbEndpoint = (payload.tools || []).find(
        (item) =>
          item.owner_id === `app:${selectedAppName}` &&
          item.source_type === 'openapi' &&
          `${(item.method || '').toUpperCase()} ${item.path || ''}` === endpoint.id
      );
      if (!dbEndpoint) {
        throw new Error('Endpoint record not found in registry. Re-enable and try again.');
      }

      await http(`/tools/${dbEndpoint.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ description: nextDescription, version: dbEndpoint.current_version || endpoint.current_version || '1.0.0' }),
      });
      setRegisteredEndpoints((prev) =>
        prev.map((item) =>
          item.id === endpoint.id ? { ...item, description: nextDescription } : item
        )
      );
    } catch (err) {
      setRegisteredEndpointsError(err instanceof Error ? err.message : 'Failed to update endpoint description');
    } finally {
      setSavingEndpointDescriptionId(null);
    }
  };

  const registerSelected = async () => {
    if (selectedEndpoints.size === 0) {
      setError('Select at least one API endpoint before registration.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/register-base-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          url: formData.url.trim(),
          description: formData.description.trim(),
          openapi_path: formData.openapi_path.trim(),
          include_unreachable_tools: formData.include_unreachable_tools,
          domain_type: formData.domain_type,
          selected_endpoints: Array.from(selectedEndpoints),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || 'Registration failed');
      }

      setSuccess(`Registered application with ${selectedEndpoints.size} selected endpoint(s).`);
      setFormData({
        name: '',
        url: '',
        description: '',
        openapi_path: '',
        include_unreachable_tools: false,
        domain_type: 'ADM',
      });
      setIsModalOpen(false);
      setDiscoveredEndpoints([]);
      setSelectedEndpoints(new Set());
      setActiveEndpointId(null);
      await syncCatalog();
      const toolsPayload = await http<{
        tools: Array<{
          id: number;
          owner_id: string;
          source_type: string;
          method?: string;
          path?: string;
          description: string;
          current_version?: string;
        }>
      }>('/tools?include_inactive=true');
      const ownerId = `app:${formData.name.trim()}`;
      const selectedIds = new Set(Array.from(selectedEndpoints));
      const selectedRows = (toolsPayload.tools || []).filter((tool) => {
        if (tool.owner_id !== ownerId || tool.source_type !== 'openapi') return false;
        const key = `${(tool.method || '').toUpperCase()} ${tool.path || ''}`;
        return selectedIds.has(key);
      });
      await Promise.all(
        selectedRows.map((tool) => {
          const key = `${(tool.method || '').toUpperCase()} ${tool.path || ''}`;
          const nextDescription = (selectedEndpointDescriptions[key] || tool.description || '').trim();
          if (!nextDescription || nextDescription === (tool.description || '')) return Promise.resolve();
          return http(`/tools/${tool.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ description: nextDescription, version: tool.current_version || '1.0.0' }),
          });
        })
      );
      await fetchApps();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 overflow-hidden">
      <Navigation pageTitle="Fetch APIs" />

      <main className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative z-10">
        <div className="grid md:grid-cols-2 gap-8">
          <section>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent mb-2">Fetch APIs</h2>
            <p className="text-slate-600 mb-6">Discover API endpoints, inspect operation details, and register selected endpoints.</p>

            {success && <div className="mb-4 p-3 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700">{success}</div>}
            {error && <div className="mb-4 p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-700">{error}</div>}

            <div className="space-y-4 bg-white/85 border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Application Name</label>
                <input name="name" value={formData.name} onChange={onChangeInput} className="w-full px-3 py-2 rounded-lg border border-slate-300" placeholder="e.g. billing-api" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Base URL</label>
                <input name="url" value={formData.url} onChange={onChangeInput} className="w-full px-3 py-2 rounded-lg border border-slate-300" placeholder="http://127.0.0.1:8000" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea name="description" value={formData.description} onChange={onChangeInput} className="w-full px-3 py-2 rounded-lg border border-slate-300" rows={3} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Custom OpenAPI Path (optional)</label>
                <input name="openapi_path" value={formData.openapi_path} onChange={onChangeInput} className="w-full px-3 py-2 rounded-lg border border-slate-300" placeholder="/openapi.json" />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="include_unreachable_tools"
                  type="checkbox"
                  name="include_unreachable_tools"
                  checked={formData.include_unreachable_tools}
                  onChange={onChangeInput}
                />
                <label htmlFor="include_unreachable_tools" className="text-sm text-slate-700">Include placeholder when API is unreachable/empty</label>
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

              <Button onClick={fetchApis} disabled={discovering || loading} className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                {discovering ? 'Fetching APIs...' : 'Fetch APIs'}
              </Button>
            </div>
          </section>

          <section>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-blue-500 bg-clip-text text-transparent mb-2">Registered Applications</h2>
            <p className="text-slate-600 mb-6">Includes active and inactive applications for status tracking.</p>

            <div className="space-y-3">
              {apps.length === 0 && <div className="p-6 rounded-xl border border-slate-200 bg-white">No applications found.</div>}
              {apps.map((app) => (
                <div
                  key={app.name}
                  onClick={() => void loadRegisteredEndpoints(app.name)}
                  className="p-4 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 hover:border-blue-400 transition-colors cursor-pointer shadow-sm"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void loadRegisteredEndpoints(app.name);
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{app.name}</p>
                      <p className="text-sm text-slate-600 break-all">{app.url}</p>
                      <Link
                        href={
                          `/api-explorer?url=${encodeURIComponent(app.url)}&name=${encodeURIComponent(app.name)}` +
                          (app.openapi_path ? `&openapi_path=${encodeURIComponent(app.openapi_path)}` : '')
                        }
                        className="text-xs text-blue-600 underline mt-1 inline-block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open API Explorer
                      </Link>
                    </div>
                    <div className="text-right text-xs">
                      <p className="text-slate-700">{app.domain_type || 'ADM'}</p>
                      <p className={app.is_deleted ? 'text-red-600' : app.is_enabled ? 'text-emerald-600' : 'text-amber-600'}>
                        {app.is_deleted ? 'Deleted' : app.is_enabled ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                  </div>
                </div>
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
                <h3 className="text-lg font-semibold text-slate-900">Select API Endpoints</h3>
                <p className="text-xs text-slate-600 mt-1">Choose endpoints to register for {formData.name || 'this application'}.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600">Model</label>
                  <select
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    className="min-w-[200px] px-2 py-1 rounded-lg border border-slate-300 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {llmModels.length === 0 && <option value="">No models found</option>}
                    {llmModels.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  {llmModelError && <span className="text-xs text-red-600">{llmModelError}</span>}
                </div>
                <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Close</Button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-0">
              <div className="p-4 border-r border-slate-200 max-h-[70vh] overflow-auto">
                {discoveredEndpoints.length === 0 && <p className="text-sm text-slate-600">No endpoints discovered.</p>}
                {discoveredEndpoints.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setSelectedEndpoints(new Set(discoveredEndpoints.map((endpoint) => endpoint.id)))}>
                        Select All
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setSelectedEndpoints(new Set())}>
                        Unselect All
                      </Button>
                    </div>
                    <p className="text-xs text-slate-600">Page {discoveryPage} / {discoveryTotalPages}</p>
                  </div>
                )}
                <div className="space-y-2">
                  {discoveryPageItems.map((endpoint) => (
                    <div
                      key={endpoint.id}
                      onClick={() => setActiveEndpointId(endpoint.id)}
                      className={`w-full text-left p-3 rounded-lg border cursor-pointer ${activeEndpointId === endpoint.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'}`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setActiveEndpointId(endpoint.id);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-slate-900">{endpoint.method} {endpoint.path}</p>
                        <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={selectedEndpoints.has(endpoint.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleEndpoint(endpoint.id);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          Selected
                        </label>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{endpoint.summary || endpoint.description || endpoint.operationId}</p>
                      <textarea
                        value={selectedEndpointDescriptions[endpoint.id] ?? ''}
                        onChange={(e) => setSelectedEndpointDescription(endpoint.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 w-full px-2 py-1 text-xs rounded border border-slate-300"
                        rows={2}
                        placeholder="Description override for registration"
                      />
                      <div className="mt-2 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void generateEndpointDescription(endpoint);
                          }}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                          disabled={generatingEndpointDescriptionId === endpoint.id}
                        >
                          {generatingEndpointDescriptionId === endpoint.id ? 'Generating...' : 'Generate with LLM'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {discoveredEndpoints.length > DISCOVERY_PAGE_SIZE && (
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
                {!activeEndpoint && <p className="text-sm text-slate-600">Select an endpoint to view its configuration.</p>}
                {activeEndpoint && (
                  <div className="space-y-3">
                    <h4 className="text-base font-semibold text-slate-900">{activeEndpoint.method} {activeEndpoint.path}</h4>
                    <p className="text-sm text-slate-700">{activeEndpoint.summary || activeEndpoint.description || 'No description'}</p>

                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1">Required Parameters</p>
                      <pre className="text-xs bg-slate-950 text-slate-100 rounded-lg p-3 overflow-auto">{formatJson(activeEndpoint.parameters)}</pre>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1">Request Format</p>
                      <pre className="text-xs bg-slate-950 text-slate-100 rounded-lg p-3 overflow-auto">{formatJson(activeEndpoint.requestBody)}</pre>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1">Response Format</p>
                      <pre className="text-xs bg-slate-950 text-slate-100 rounded-lg p-3 overflow-auto">{formatJson(activeEndpoint.responses)}</pre>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between">
              <p className="text-sm text-slate-700">Selected: {selectedEndpoints.size} / {discoveredEndpoints.length}</p>
              <Button onClick={registerSelected} disabled={loading || selectedEndpoints.size === 0} className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                {loading ? 'Registering...' : 'Register Selected Endpoints'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedAppName && (
        <div className="fixed inset-0 z-[120] bg-black/50 p-4 md:p-8 overflow-auto">
          <div className="max-w-6xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Registered API Endpoints</h3>
                <p className="text-xs text-slate-600 mt-1">Application: {selectedAppName} (database-backed controls)</p>
              </div>
              <Button variant="secondary" onClick={() => setSelectedAppName(null)}>Close</Button>
            </div>

            <div className="p-4">
              {registeredSyncing && (
                <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                  <span className="h-4 w-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                  Syncing latest state...
                </div>
              )}
              {registeredEndpointsError && (
                <div className="mb-3 p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm">
                  {registeredEndpointsError}
                </div>
              )}
              {registeredEndpointsLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="h-4 w-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                  Loading endpoints...
                </div>
              ) : registeredEndpoints.length === 0 ? (
                <p className="text-sm text-slate-600">No endpoints discovered for this application.</p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setRegisteredSelectedEndpoints(new Set(registeredEndpoints.map((row) => row.id)))}
                        className="bg-blue-50 border-blue-300 text-blue-700"
                      >
                        Select All
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setRegisteredSelectedEndpoints(new Set())}
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
                        {registeredPageItems.map((endpoint) => (
                          <button
                            key={endpoint.id}
                            type="button"
                            onClick={() => setActiveEndpointId(endpoint.id)}
                            className={`w-full text-left p-3 rounded-lg border ${activeEndpointId === endpoint.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-slate-900">{endpoint.method} {endpoint.path}</p>
                              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={registeredSelectedEndpoints.has(endpoint.id)}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    setRegisteredSelectedEndpoints((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(endpoint.id)) next.delete(endpoint.id);
                                      else next.add(endpoint.id);
                                      return next;
                                    });
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                Enabled
                              </label>
                            </div>
                            <p className="text-xs text-slate-600 mt-1 line-clamp-2">{endpoint.description || 'No description'}</p>
                          </button>
                        ))}
                      </div>

                      {registeredEndpoints.length > REGISTERED_PAGE_SIZE && (
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
                      {!activeRegisteredEndpoint ? (
                        <p className="text-sm text-slate-600">Select an endpoint to view configuration.</p>
                      ) : (
                        <div className="space-y-3">
                          <h4 className="text-base font-semibold text-slate-900">{activeRegisteredEndpoint.method} {activeRegisteredEndpoint.path}</h4>
                          <p className="text-xs text-slate-600">
                            Current state: {registeredSelectedEndpoints.has(activeRegisteredEndpoint.id) ? 'Enabled' : 'Disabled'}
                          </p>
                          <textarea
                            value={draftEndpointDescriptions[activeRegisteredEndpoint.id] ?? ''}
                            onChange={(e) =>
                              setDraftEndpointDescriptions((prev) => ({ ...prev, [activeRegisteredEndpoint.id]: e.target.value }))
                            }
                            className="w-full min-w-[260px] px-2 py-1 text-xs rounded border border-slate-300"
                            rows={2}
                            placeholder="Endpoint description"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => void saveRegisteredEndpointDescription(activeRegisteredEndpoint)}
                              disabled={savingEndpointDescriptionId === activeRegisteredEndpoint.id || registeredSyncing}
                            >
                              {savingEndpointDescriptionId === activeRegisteredEndpoint.id ? 'Saving...' : 'Save Description'}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={generatingRegisteredDescriptionId === activeRegisteredEndpoint.id}
                              onClick={() => void generateRegisteredEndpointDescription(activeRegisteredEndpoint)}
                            >
                              {generatingRegisteredDescriptionId === activeRegisteredEndpoint.id ? 'Generating...' : 'Generate with LLM'}
                            </Button>
                          </div>
                          <details>
                            <summary className="text-xs text-slate-700 cursor-pointer">View request/response config</summary>
                            <div className="mt-2 grid gap-2">
                              <pre className="text-xs bg-slate-950 text-slate-100 rounded-lg p-3 overflow-auto">{formatJson(activeRegisteredEndpoint.parameters)}</pre>
                              <pre className="text-xs bg-slate-950 text-slate-100 rounded-lg p-3 overflow-auto">{formatJson(activeRegisteredEndpoint.requestBody)}</pre>
                              <pre className="text-xs bg-slate-950 text-slate-100 rounded-lg p-3 overflow-auto">{formatJson(activeRegisteredEndpoint.responses)}</pre>
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between">
              <p className="text-sm text-slate-700">Enabled: {registeredSelectedEndpoints.size} / {registeredEndpoints.length}</p>
              <Button
                onClick={() => void applyRegisteredEndpointSelection()}
                disabled={registeredSyncing || registeredEndpointsLoading}
                className="bg-gradient-to-r from-blue-500 to-blue-600 text-white"
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
