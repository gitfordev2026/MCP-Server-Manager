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

function getMethodBadgeClass(method: string) {
  const m = (method || '').toUpperCase();
  switch (m) {
    case 'GET':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/50';
    case 'POST':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-700/50';
    case 'PUT':
    case 'PATCH':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-700/50';
    case 'DELETE':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-700/50';
    default:
      return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';
  }
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
  const [criticalWarning, setCriticalWarning] = useState<{
    endpointId?: string;
    method?: string;
    path?: string;
    isRegistered?: boolean;
    isSelectAll?: boolean;
    endpointsToSelect?: Set<string>;
    count?: number;
  } | null>(null);

  const CRITICAL_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

  const isCriticalEndpoint = (endpointId: string): { method: string; path: string } | null => {
    const parts = endpointId.split(' ');
    const method = parts[0]?.toUpperCase() || '';
    if (CRITICAL_METHODS.includes(method)) {
      return { method, path: parts.slice(1).join(' ') };
    }
    return null;
  };

  const handleSelectAllEndpoints = (endpointsList: (ModalEndpoint | DiscoveredEndpoint)[], isRegistered: boolean) => {
    const allIds = new Set(endpointsList.map((ep) => ep.id));
    const criticalCount = endpointsList.filter((ep) => CRITICAL_METHODS.includes(ep.method)).length;

    if (criticalCount > 0) {
      setCriticalWarning({
        isSelectAll: true,
        isRegistered,
        endpointsToSelect: allIds,
        count: criticalCount,
      });
    } else {
      if (isRegistered) {
        setRegisteredSelectedEndpoints(allIds);
      } else {
        setSelectedEndpoints(allIds);
      }
    }
  };

  const toggleEndpoint = (endpointId: string) => {
    // If already selected, always allow deselection without warning
    if (selectedEndpoints.has(endpointId)) {
      setSelectedEndpoints((prev) => {
        const next = new Set(prev);
        next.delete(endpointId);
        return next;
      });
      return;
    }

    // If selecting a critical method, show warning first
    const critical = isCriticalEndpoint(endpointId);
    if (critical) {
      setCriticalWarning({ endpointId, ...critical, isRegistered: false });
      return;
    }

    // Safe method - select directly
    setSelectedEndpoints((prev) => {
      const next = new Set(prev);
      next.add(endpointId);
      return next;
    });
  };

  const toggleRegisteredEndpoint = (endpointId: string) => {
    if (registeredSelectedEndpoints.has(endpointId)) {
      setRegisteredSelectedEndpoints((prev) => {
        const next = new Set(prev);
        next.delete(endpointId);
        return next;
      });
      return;
    }

    const critical = isCriticalEndpoint(endpointId);
    if (critical) {
      setCriticalWarning({ endpointId, ...critical, isRegistered: true });
      return;
    }

    setRegisteredSelectedEndpoints((prev) => {
      const next = new Set(prev);
      next.add(endpointId);
      return next;
    });
  };

  const confirmCriticalEndpoint = () => {
    if (criticalWarning) {
      if (criticalWarning.isSelectAll && criticalWarning.endpointsToSelect) {
        if (criticalWarning.isRegistered) {
          setRegisteredSelectedEndpoints(criticalWarning.endpointsToSelect);
        } else {
          setSelectedEndpoints(criticalWarning.endpointsToSelect);
        }
      } else if (criticalWarning.endpointId) {
        if (criticalWarning.isRegistered) {
          setRegisteredSelectedEndpoints((prev) => {
            const next = new Set(prev);
            next.add(criticalWarning.endpointId!);
            return next;
          });
        } else {
          setSelectedEndpoints((prev) => {
            const next = new Set(prev);
            next.add(criticalWarning.endpointId!);
            return next;
          });
        }
      }
      setCriticalWarning(null);
    }
  };
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
      const initial = new Set<string>(endpoints.filter((ep) => ep.method === 'GET').map((ep) => ep.id));
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
      const response = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/agent/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model: llmModel }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || `HTTP ${response.status}`);
      }
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
      const response = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/agent/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model: llmModel }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || `HTTP ${response.status}`);
      }
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
    const dbByEndpointKey = new Map<string, (typeof dbPayload.tools)[number]>(
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

      // Use the by-endpoint route to avoid race with catalog sync.
      // endpoint.id is "METHOD /path" e.g. "GET /items"
      const [method, ...pathParts] = endpoint.id.split(' ');
      const path = pathParts.join(' ');

      const res = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/tools/by-endpoint`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_id: `app:${selectedAppName}`,
          method: method,
          path: path,
          description: nextDescription,
          version: endpoint.current_version || '1.0.0',
        }),
      });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload?.detail || 'Failed to update endpoint description');
      }

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Navigation pageTitle="Fetch APIs" />

      <main className="pt-8 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative z-10">
        <div className="grid md:grid-cols-2 gap-8">
          <section>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 dark:from-blue-400 dark:to-blue-300 bg-clip-text text-transparent mb-2">Fetch APIs</h2>
            <p className="text-slate-700 dark:text-slate-300 mb-6 font-medium">Discover API endpoints, inspect operation details, and register selected endpoints.</p>

            {success && <div className="mb-4 p-3 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">{success}</div>}
            {error && <div className="mb-4 p-3 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300">{error}</div>}

            <div className="space-y-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Application Name</label>
                <input name="name" value={formData.name} onChange={onChangeInput} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/40 outline-none" placeholder="e.g. billing-api" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Base URL</label>
                <input name="url" value={formData.url} onChange={onChangeInput} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/40 outline-none" placeholder="http://127.0.0.1:8000" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Description</label>
                <textarea name="description" value={formData.description} onChange={onChangeInput} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/40 outline-none" rows={3} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Custom OpenAPI Path (optional)</label>
                <input name="openapi_path" value={formData.openapi_path} onChange={onChangeInput} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/40 outline-none" placeholder="/openapi.json" />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="include_unreachable_tools"
                  type="checkbox"
                  name="include_unreachable_tools"
                  checked={formData.include_unreachable_tools}
                  onChange={onChangeInput}
                  className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="include_unreachable_tools" className="text-sm font-medium text-slate-700 dark:text-slate-300">Include placeholder when API is unreachable/empty</label>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Domain Type</p>
                <div className="flex gap-4">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input type="radio" checked={formData.domain_type === 'ADM'} onChange={() => onChangeDomain('ADM')} className="text-blue-600 focus:ring-blue-500" />
                    ADM
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input type="radio" checked={formData.domain_type === 'OPS'} onChange={() => onChangeDomain('OPS')} className="text-blue-600 focus:ring-blue-500" />
                    OPS
                  </label>
                </div>
              </div>

              <Button onClick={fetchApis} disabled={discovering || loading} className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md">
                {discovering ? 'Fetching APIs...' : 'Fetch APIs'}
              </Button>
            </div>
          </section>

          <section>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-blue-500 dark:from-cyan-400 dark:to-blue-400 bg-clip-text text-transparent mb-2">Registered Applications</h2>
            <p className="text-slate-700 dark:text-slate-300 mb-6 font-medium">Includes active and inactive applications for status tracking.</p>

            <div className="space-y-3">
              {apps.length === 0 && <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-medium">No applications found.</div>}
              {apps.map((app) => (
                <div
                  key={app.name}
                  onClick={() => void loadRegisteredEndpoints(app.name)}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-500 dark:hover:border-blue-400 transition-colors cursor-pointer shadow-xs"
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
                      <p className="font-semibold text-slate-900 dark:text-white">{app.name}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 break-all">{app.url}</p>
                      <Link
                        href={
                          `/api-explorer?url=${encodeURIComponent(app.url)}&name=${encodeURIComponent(app.name)}` +
                          (app.openapi_path ? `&openapi_path=${encodeURIComponent(app.openapi_path)}` : '')
                        }
                        className="text-xs text-blue-600 dark:text-blue-400 font-semibold underline mt-1 inline-block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open API Explorer
                      </Link>
                    </div>
                    <div className="text-right text-xs">
                      <p className="text-slate-700 dark:text-slate-300 font-medium">{app.domain_type || 'ADM'}</p>
                      <p className={app.is_deleted ? 'text-rose-600 dark:text-rose-400 font-semibold' : app.is_enabled ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-600 dark:text-amber-400 font-semibold'}>
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
        <div className="fixed inset-0 z-[120] bg-black/70 p-4 md:p-8 overflow-auto backdrop-blur-xs flex items-center justify-center">
          <div className="w-full max-w-6xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <div>
                <h3 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                  Select API Endpoints
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Choose endpoints to register for <span className="font-semibold text-slate-800 dark:text-slate-200">{formData.name || 'this application'}</span>.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Model</label>
                  <select
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    className="min-w-[180px] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    {llmModels.length === 0 && <option value="">No models found</option>}
                    {llmModels.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  {llmModelError && <span className="text-xs text-rose-500">{llmModelError}</span>}
                </div>
                <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Close</Button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-0 divide-x divide-slate-200 dark:divide-slate-800 overflow-hidden flex-1">
              <div className="p-4 overflow-auto max-h-[65vh] space-y-3 bg-slate-50/30 dark:bg-slate-950/20">
                {discoveredEndpoints.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">No endpoints discovered.</p>}
                {discoveredEndpoints.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="secondary" onClick={() => handleSelectAllEndpoints(discoveredEndpoints, false)}>
                        Select All
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setSelectedEndpoints(new Set(discoveredEndpoints.filter((ep) => ep.method === 'GET').map((ep) => ep.id)))}>
                        GET Only
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setSelectedEndpoints(new Set())}>
                        Unselect All
                      </Button>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Page {discoveryPage} / {discoveryTotalPages}</p>
                  </div>
                )}
                <div className="space-y-2.5">
                  {discoveryPageItems.map((endpoint) => {
                    const isActive = activeEndpointId === endpoint.id;
                    const isSelected = selectedEndpoints.has(endpoint.id);
                    return (
                      <div
                        key={endpoint.id}
                        onClick={() => setActiveEndpointId(endpoint.id)}
                        className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer shadow-xs ${
                          isActive
                            ? 'border-blue-500 dark:border-blue-500/80 bg-blue-50/80 dark:bg-blue-950/40 ring-1 ring-blue-500/30'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 text-[11px] font-bold rounded-md border uppercase ${getMethodBadgeClass(endpoint.method)}`}>
                              {endpoint.method}
                            </span>
                            <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 break-all">{endpoint.path}</span>
                            {CRITICAL_METHODS.includes(endpoint.method) && !isSelected && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700/50">⚠ Critical</span>
                            )}
                          </div>
                          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleEndpoint(endpoint.id);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                            />
                            Selected
                          </label>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 line-clamp-2">{endpoint.summary || endpoint.description || endpoint.operationId}</p>
                        <textarea
                          value={selectedEndpointDescriptions[endpoint.id] ?? ''}
                          onChange={(e) => setSelectedEndpointDescription(endpoint.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-2.5 w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/30 outline-none"
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
                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                            disabled={generatingEndpointDescriptionId === endpoint.id}
                          >
                            {generatingEndpointDescriptionId === endpoint.id ? 'Generating...' : 'Generate with LLM'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {discoveredEndpoints.length > DISCOVERY_PAGE_SIZE && (
                  <div className="mt-3 flex items-center justify-between pt-2">
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

              <div className="p-5 overflow-auto max-h-[65vh] bg-white dark:bg-slate-900">
                {!activeEndpoint && <p className="text-sm text-slate-600 dark:text-slate-400">Select an endpoint to view its configuration.</p>}
                {activeEndpoint && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-slate-200 dark:border-slate-800">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-md border uppercase ${getMethodBadgeClass(activeEndpoint.method)}`}>
                        {activeEndpoint.method}
                      </span>
                      <h4 className="text-base font-mono font-bold text-slate-900 dark:text-white">{activeEndpoint.path}</h4>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">{activeEndpoint.summary || activeEndpoint.description || 'No description'}</p>

                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Required Parameters</p>
                      <pre className="text-xs bg-slate-950 text-slate-100 border border-slate-800 rounded-xl p-3.5 overflow-auto font-mono">{formatJson(activeEndpoint.parameters)}</pre>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Request Format</p>
                      <pre className="text-xs bg-slate-950 text-slate-100 border border-slate-800 rounded-xl p-3.5 overflow-auto font-mono">{formatJson(activeEndpoint.requestBody)}</pre>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Response Format</p>
                      <pre className="text-xs bg-slate-950 text-slate-100 border border-slate-800 rounded-xl p-3.5 overflow-auto font-mono">{formatJson(activeEndpoint.responses)}</pre>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Selected: {selectedEndpoints.size} / {discoveredEndpoints.length}</p>
              <Button onClick={registerSelected} disabled={loading || selectedEndpoints.size === 0} className="bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md">
                {loading ? 'Registering...' : 'Register Selected Endpoints'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedAppName && (
        <div className="fixed inset-0 z-[120] bg-black/70 p-4 md:p-8 overflow-auto backdrop-blur-xs flex items-center justify-center">
          <div className="w-full max-w-6xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <div>
                <h3 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                  Registered API Endpoints
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Application: <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedAppName}</span> (database-backed controls)</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Model</label>
                  <select
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    className="min-w-[180px] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    {llmModels.length === 0 && <option value="">No models found</option>}
                    {llmModels.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  {llmModelError && <span className="text-xs text-rose-500">{llmModelError}</span>}
                </div>
                <Button variant="secondary" onClick={() => setSelectedAppName(null)}>Close</Button>
              </div>
            </div>

            <div className="p-4 flex-1 overflow-auto">
              {registeredSyncing && (
                <div className="mb-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <span className="h-4 w-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                  Syncing latest state...
                </div>
              )}
              {registeredEndpointsError && (
                <div className="mb-3 p-3 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-sm">
                  {registeredEndpointsError}
                </div>
              )}
              {registeredEndpointsLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <span className="h-4 w-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                  Loading endpoints...
                </div>
              ) : registeredEndpoints.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">No endpoints discovered for this application.</p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSelectAllEndpoints(registeredEndpoints, true)}
                      >
                        Select All
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setRegisteredSelectedEndpoints(new Set(registeredEndpoints.filter((ep) => ep.method === 'GET').map((row) => row.id)))}
                      >
                        GET Only
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setRegisteredSelectedEndpoints(new Set())}
                      >
                        Unselect All
                      </Button>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Page {registeredPage} / {registeredTotalPages}</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-0 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-x divide-slate-200 dark:divide-slate-800">
                    <div className="p-4 max-h-[55vh] overflow-auto bg-slate-50/40 dark:bg-slate-950/30">
                      <div className="space-y-2">
                        {registeredPageItems.map((endpoint) => {
                          const isActive = activeEndpointId === endpoint.id;
                          const isEnabled = registeredSelectedEndpoints.has(endpoint.id);
                          return (
                            <button
                              key={endpoint.id}
                              type="button"
                              onClick={() => setActiveEndpointId(endpoint.id)}
                              className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                                isActive
                                  ? 'border-blue-500 dark:border-blue-500/80 bg-blue-50/80 dark:bg-blue-950/40 ring-1 ring-blue-500/30'
                                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`px-2 py-0.5 text-[11px] font-bold rounded-md border uppercase ${getMethodBadgeClass(endpoint.method)}`}>
                                    {endpoint.method}
                                  </span>
                                  <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 break-all">{endpoint.path}</span>
                                  {CRITICAL_METHODS.includes(endpoint.method) && !isEnabled && (
                                    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700/50">⚠ Critical</span>
                                  )}
                                </div>
                                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isEnabled}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      toggleRegisteredEndpoint(endpoint.id);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                                  />
                                  Enabled
                                </label>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 line-clamp-2">{endpoint.description || 'No description'}</p>
                            </button>
                          );
                        })}
                      </div>

                      {registeredEndpoints.length > REGISTERED_PAGE_SIZE && (
                        <div className="mt-3 flex items-center justify-between pt-2">
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

                    <div className="p-5 max-h-[55vh] overflow-auto bg-white dark:bg-slate-900">
                      {!activeRegisteredEndpoint ? (
                        <p className="text-sm text-slate-600 dark:text-slate-400">Select an endpoint to view configuration.</p>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-slate-200 dark:border-slate-800">
                            <span className={`px-2.5 py-1 text-xs font-bold rounded-md border uppercase ${getMethodBadgeClass(activeRegisteredEndpoint.method)}`}>
                              {activeRegisteredEndpoint.method}
                            </span>
                            <h4 className="text-base font-mono font-bold text-slate-900 dark:text-white">{activeRegisteredEndpoint.path}</h4>
                          </div>
                          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            Current state: <span className={registeredSelectedEndpoints.has(activeRegisteredEndpoint.id) ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-500 font-semibold'}>{registeredSelectedEndpoints.has(activeRegisteredEndpoint.id) ? 'Enabled' : 'Disabled'}</span>
                          </p>
                          <textarea
                            value={draftEndpointDescriptions[activeRegisteredEndpoint.id] ?? ''}
                            onChange={(e) =>
                              setDraftEndpointDescriptions((prev) => ({ ...prev, [activeRegisteredEndpoint.id]: e.target.value }))
                            }
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/30 outline-none"
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
                          <details className="mt-3">
                            <summary className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">View request/response config</summary>
                            <div className="mt-2 grid gap-2">
                              <pre className="text-xs bg-slate-950 text-slate-100 border border-slate-800 rounded-xl p-3.5 overflow-auto font-mono">{formatJson(activeRegisteredEndpoint.parameters)}</pre>
                              <pre className="text-xs bg-slate-950 text-slate-100 border border-slate-800 rounded-xl p-3.5 overflow-auto font-mono">{formatJson(activeRegisteredEndpoint.requestBody)}</pre>
                              <pre className="text-xs bg-slate-950 text-slate-100 border border-slate-800 rounded-xl p-3.5 overflow-auto font-mono">{formatJson(activeRegisteredEndpoint.responses)}</pre>
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Enabled: {registeredSelectedEndpoints.size} / {registeredEndpoints.length}</p>
              <Button
                onClick={() => void applyRegisteredEndpointSelection()}
                disabled={registeredSyncing || registeredEndpointsLoading}
                className="bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md"
              >
                {registeredSyncing ? 'Applying...' : 'Apply Selection'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {criticalWarning && (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-400 dark:border-amber-600 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <span className="text-lg">⚠️</span>
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  {criticalWarning.isSelectAll ? 'Critical APIs Warning' : 'Critical API Warning'}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">These endpoints can modify data</p>
              </div>
            </div>

            {criticalWarning.isSelectAll ? (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-900 dark:text-amber-200 font-medium">
                  Select All includes <strong className="text-amber-900 dark:text-amber-100">{criticalWarning.count} critical endpoint(s)</strong> (POST, PUT, PATCH, DELETE).
                </p>
              </div>
            ) : (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-900 dark:text-amber-200 font-medium">
                  You are about to enable a <span className={`inline-block px-1.5 py-0.5 text-[11px] font-bold rounded-md border uppercase ${getMethodBadgeClass(criticalWarning.method || '')}`}>{criticalWarning.method}</span> endpoint:
                </p>
                <p className="text-sm font-mono text-amber-800 dark:text-amber-300 mt-1 break-all">{criticalWarning.path}</p>
              </div>
            )}

            <p className="text-xs text-slate-600 dark:text-slate-400 mb-5">
              <strong>POST</strong>, <strong>PUT</strong>, <strong>PATCH</strong>, and <strong>DELETE</strong> endpoints can create, modify, or delete data. Ensure these endpoints are safe to expose before enabling them.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCriticalWarning(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCriticalEndpoint}
                className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors shadow-md"
              >
                {criticalWarning.isSelectAll ? 'Enable All Anyway' : 'Enable Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
