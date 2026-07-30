'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/ui/Card';
import Navigation from '@/components/Navigation';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { publicEnv } from '@/lib/env';
import { authenticatedFetch } from '@/services/http';

const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL;

interface PathItem {
  path: string;
  methods: {
    method: string;
    summary?: string;
    description?: string;
    parameters?: Array<{
      name: string;
      in: string;
      required: boolean;
      schema?: { type: string };
    }>;
    responses?: Record<string, unknown>;
  }[];
}

interface OpenAPISpec {
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  paths?: Record<string, Record<string, unknown>>;
  servers?: Array<{ url: string; description?: string }>;
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

function ApiExplorerContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get('url') || '';
  const name = searchParams.get('name') || 'API';
  const openapiPath = searchParams.get('openapi_path') || '';

  const [spec, setSpec] = useState<OpenAPISpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pathItems, setPathItems] = useState<PathItem[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [testQueryParams, setTestQueryParams] = useState('');
  const [testRequestBody, setTestRequestBody] = useState('');
  const [testResponse, setTestResponse] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);
  const totalOperations = pathItems.reduce((total, item) => total + item.methods.length, 0);

  const resolveSchema = (schemaObj: any): any => {
    if (!schemaObj) return null;
    if (schemaObj.$ref) {
      const refPath = schemaObj.$ref; // e.g. "#/components/schemas/UserLoginRequest"
      const parts = refPath.replace(/^#\//, '').split('/');
      let current = spec;
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = (current as any)[part];
        } else {
          return null;
        }
      }
      return resolveSchema(current); // Recursively resolve if nested
    }
    return schemaObj;
  };

  const generateExampleJson = (properties: Record<string, any>): string => {
    const example: Record<string, any> = {};
    Object.entries(properties).forEach(([key, val]) => {
      const resolvedVal = resolveSchema(val);
      if (resolvedVal) {
        if (resolvedVal.type === 'integer' || resolvedVal.type === 'number') {
          example[key] = 0;
        } else if (resolvedVal.type === 'boolean') {
          example[key] = false;
        } else if (resolvedVal.type === 'array') {
          example[key] = [];
        } else if (resolvedVal.type === 'object') {
          example[key] = {};
        } else {
          example[key] = "string";
        }
      } else {
        example[key] = "string";
      }
    });
    return JSON.stringify(example, null, 2);
  };

  useEffect(() => {
    setTestQueryParams('');
    setTestRequestBody('');
    setTestResponse(null);

    if (selectedMethod) {
      const [idxStr, methodIdxStr] = selectedMethod.split('-');
      const idx = parseInt(idxStr);
      const methodIdx = parseInt(methodIdxStr);
      const item = pathItems[idx];
      const methodObj = item?.methods[methodIdx];
      if (methodObj) {
        // Pre-fill query parameters template
        if (methodObj.parameters && Array.isArray(methodObj.parameters)) {
          const queries = methodObj.parameters
            .filter((p: any) => p.in === 'query')
            .map((p: any) => {
              const param = resolveSchema(p);
              return `${param.name}=value`;
            })
            .join('&');
          if (queries) {
            setTestQueryParams(`?${queries}`);
          }
        }
        
        // Pre-fill request body template
        try {
          const bodySchema = resolveSchema((methodObj as any).requestBody?.content?.['application/json']?.schema);
          if (bodySchema && bodySchema.properties) {
            setTestRequestBody(generateExampleJson(bodySchema.properties));
          }
        } catch (e) {}
      }
    }
  }, [selectedMethod, pathItems, spec]);

  useEffect(() => {
    if (!url) {
      setError('No URL provided');
      setLoading(false);
      return;
    }
    if (!NEXT_PUBLIC_BE_API_URL) {
      setError('Backend API URL is not configured (NEXT_PUBLIC_BE_API_URL)');
      setLoading(false);
      return;
    }

    const fetchOpenAPI = async () => {
      try {
        setLoading(true);
        setError(null);

        const query = new URLSearchParams({ url });
        const customPath = openapiPath.trim();
        if (customPath) {
          query.set('openapi_path', customPath);
        }
        const response = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/openapi-spec?${query.toString()}`);
        const payload = await response.json();

        if (!response.ok) {
          const detail =
            payload && typeof payload === 'object' && 'detail' in payload
              ? String(payload.detail)
              : `HTTP ${response.status}`;
          throw new Error(`Failed to fetch OpenAPI spec: ${detail}`);
        }

        const data = payload as OpenAPISpec;
        setSpec(data);

        if (data.paths) {
          const items: PathItem[] = [];
          Object.entries(data.paths).forEach(([path, pathValue]) => {
            const methods: PathItem['methods'] = [];
            Object.entries(pathValue as Record<string, unknown>).forEach(([method, details]) => {
              if (
                ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method.toLowerCase())
              ) {
                const detailsObj = details as Record<string, unknown>;
                methods.push({
                  method: method.toUpperCase(),
                  summary: (detailsObj.summary as string) || '',
                  description: (detailsObj.description as string) || '',
                  parameters: (detailsObj.parameters as unknown) as PathItem['methods'][0]['parameters'] || [],
                  responses: (detailsObj.responses as Record<string, unknown>) || {},
                });
              }
            });
            if (methods.length > 0) {
              items.push({ path, methods });
            }
          });
          setPathItems(items);
        }

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load API spec');
        setLoading(false);
      }
    };

    fetchOpenAPI();
  }, [url, openapiPath]);

  const handleExecuteRequest = async (item: PathItem, methodObj: PathItem['methods'][0]) => {
    setTestLoading(true);
    setTestResponse(null);
    try {
      const pathWithQuery = testQueryParams
        ? `${item.path}${testQueryParams.startsWith('?') ? '' : '?'}${testQueryParams}`
        : item.path;

      const proxyPath = `/mcp/apps/${name.toLowerCase()}${pathWithQuery}`;
      const method = methodObj.method;
      const isGet = method === 'GET' || method === 'HEAD';

      const start = Date.now();
      const res = await authenticatedFetch(`/api/proxy${proxyPath}`, {
        method,
        headers: !isGet ? { 'Content-Type': 'application/json' } : undefined,
        body: !isGet && testRequestBody ? testRequestBody : undefined,
      });
      const end = Date.now();

      let data;
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        data = await res.text();
      }

      setTestResponse({
        status: res.status,
        statusText: res.statusText,
        data,
        timeMs: end - start,
      });
    } catch (err: any) {
      setTestResponse({
        status: 500,
        statusText: 'Internal Error',
        data: err.message || 'Failed to execute request',
        timeMs: 0,
      });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-blue-500/10 dark:bg-blue-500/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Navigation Header */}
      <Navigation pageTitle="API Explorer" />

      {/* Main Container */}
      <main className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative z-10">
        {/* Header Title Section */}
        <div className="mb-8 border-b border-slate-200/80 dark:border-slate-800/80 pb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 dark:from-blue-400 dark:via-indigo-400 dark:to-emerald-400 bg-clip-text text-transparent">
              {name} API Explorer
            </h1>
          </div>
          <p className="text-sm font-mono text-slate-600 dark:text-slate-400 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            {url}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-1 font-mono">
            OpenAPI Spec Path: <span className="text-slate-700 dark:text-slate-300 font-semibold">{openapiPath.trim() || '/openapi.json (auto)'}</span>
          </p>
        </div>

        {/* Spec Overview Card */}
        {spec?.info && (
          <Card className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 mb-8 p-6 shadow-xl shadow-slate-200/20 dark:shadow-none rounded-2xl">
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">API Title</p>
                <p className="text-slate-900 dark:text-white text-lg font-bold mt-1">{spec.info.title || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Version</p>
                <p className="text-slate-900 dark:text-white text-lg font-bold mt-1">{spec.info.version || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Operations</p>
                <p className="text-slate-900 dark:text-white text-lg font-bold mt-1">{totalOperations}</p>
              </div>
            </div>
            {spec.info.description && (
              <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-800/60">
                <MarkdownRenderer content={spec.info.description} />
              </div>
            )}
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 p-6 mb-8 rounded-2xl">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-base font-bold text-rose-800 dark:text-rose-200">Unable to load OpenAPI Specification</h3>
                <p className="text-sm text-rose-700 dark:text-rose-300 mt-1">{error}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Loading State */}
        {loading && (
          <Card className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 p-12 text-center shadow-xl rounded-2xl">
            <div className="inline-flex items-center gap-3">
              <div className="w-4 h-4 bg-blue-500 rounded-full animate-bounce" />
              <div className="w-4 h-4 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
              <div className="w-4 h-4 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-4">Loading API specification...</p>
          </Card>
        )}

        {/* Empty State */}
        {!loading && !error && pathItems.length === 0 && (
          <Card className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 p-12 text-center shadow-xl rounded-2xl">
            <p className="text-slate-600 dark:text-slate-400">No endpoints found in the OpenAPI specification.</p>
          </Card>
        )}

        {/* Endpoints Table */}
        {!loading && pathItems.length > 0 && (
          <div className="space-y-6">
            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-xs uppercase font-bold text-slate-600 dark:text-slate-300">
                      <th className="px-6 py-4 w-28">Method</th>
                      <th className="px-6 py-4">Endpoint Path</th>
                      <th className="px-6 py-4">Summary & Description</th>
                      <th className="px-6 py-4 w-20 text-center">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70 text-sm">
                    {pathItems.map((item, idx) =>
                      item.methods.map((method, methodIdx) => {
                        const key = `${idx}-${methodIdx}`;
                        const isExpanded = selectedMethod === key;
                        return (
                          <React.Fragment key={key}>
                            <tr
                              onClick={() => setSelectedMethod(isExpanded ? null : key)}
                              className={`transition-colors cursor-pointer ${
                                isExpanded
                                  ? 'bg-blue-50/80 dark:bg-blue-950/40'
                                  : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/50'
                              }`}
                            >
                              {/* Method Badge */}
                              <td className="px-6 py-4 align-top">
                                <span className={`px-2.5 py-1 text-xs font-extrabold rounded-md border uppercase inline-block ${getMethodBadgeClass(method.method)}`}>
                                  {method.method}
                                </span>
                              </td>

                              {/* Endpoint Path */}
                              <td className="px-6 py-4 align-top font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 break-all">
                                {item.path}
                              </td>

                              {/* Summary & Description */}
                              <td className="px-6 py-4 align-top">
                                <div>
                                  {method.summary && (
                                    <p className="text-slate-900 dark:text-slate-200 font-semibold text-sm">{method.summary}</p>
                                  )}
                                  {method.description && method.description !== method.summary && (
                                    <p className="text-slate-600 dark:text-slate-400 text-xs mt-1 line-clamp-2 leading-relaxed">
                                      {method.description}
                                    </p>
                                  )}
                                  {!method.summary && !method.description && (
                                    <p className="text-slate-400 dark:text-slate-500 text-xs italic">No description provided</p>
                                  )}
                                </div>
                              </td>

                              {/* Expand Chevron Icon */}
                              <td className="px-6 py-4 align-top text-center">
                                <button
                                  type="button"
                                  className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition"
                                  aria-label="Toggle details"
                                >
                                  <svg
                                    className={`w-5 h-5 transform transition-transform duration-200 ${isExpanded ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                              </td>
                            </tr>

                            {/* Inline Details Panel - Opens directly below the target endpoint row */}
                            {isExpanded && (
                              <tr className="bg-slate-50/80 dark:bg-slate-950/60">
                                <td colSpan={4} className="px-6 py-6 border-b border-slate-200 dark:border-slate-800">
                                  <div className="bg-white dark:bg-slate-900 border border-blue-200/80 dark:border-slate-800 shadow-xl rounded-2xl p-6 sm:p-8">
                                    <div className="mb-6 border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
                                      <div className="flex items-center gap-3 flex-wrap">
                                        <span className={`px-3 py-1 text-xs font-extrabold rounded-md border uppercase ${getMethodBadgeClass(method.method)}`}>
                                          {method.method}
                                        </span>
                                        <h3 className="text-xl sm:text-2xl font-mono font-bold text-slate-900 dark:text-white">
                                          {item.path}
                                        </h3>
                                      </div>
                                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 font-medium">
                                        {method.summary || method.description || 'No description provided.'}
                                      </p>
                                    </div>

                                    <div className="grid lg:grid-cols-2 gap-8">
                                      {/* Parameters Section */}
                                      <div>
                                        <h4 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                          <span className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 022 2h2a2 2 0 022-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                            </svg>
                                          </span>
                                          Parameters ({method.parameters?.length || 0})
                                        </h4>

                                        {!method.parameters || method.parameters.length === 0 ? (
                                          <p className="text-xs text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
                                            No parameters required for this operation.
                                          </p>
                                        ) : (
                                          <div className="space-y-3">
                                            {method.parameters.map((param, pIdx) => (
                                              <div
                                                key={pIdx}
                                                className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 transition-all"
                                              >
                                                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                                                  <span className="text-blue-600 dark:text-blue-400 font-mono font-bold text-sm">{param.name}</span>
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-xs font-mono bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2.5 py-0.5 rounded-md">
                                                      {param.schema?.type || 'string'}
                                                    </span>
                                                    {param.required ? (
                                                      <span className="text-xs bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800/50 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                        </svg>
                                                        Required
                                                      </span>
                                                    ) : (
                                                      <span className="text-xs bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded-md font-medium">
                                                        Optional
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                                <p className="text-xs text-slate-600 dark:text-slate-400">
                                                  Location: <span className="text-slate-800 dark:text-slate-200 font-mono font-semibold uppercase">{param.in}</span>
                                                </p>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>

                                      {/* Responses Section */}
                                      <div>
                                        <h4 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                          <span className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                          </span>
                                          Responses ({Object.keys(method.responses || {}).length})
                                        </h4>

                                        {!method.responses || Object.keys(method.responses).length === 0 ? (
                                          <p className="text-xs text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
                                            No response schema documented.
                                          </p>
                                        ) : (
                                          <div className="space-y-3">
                                            {Object.entries(method.responses).map(([statusCode, response]) => {
                                              const is2xx = statusCode.startsWith('2');
                                              const is4xx = statusCode.startsWith('4');
                                              return (
                                                <div
                                                  key={statusCode}
                                                  className={`rounded-xl p-4 border transition-all ${
                                                    is2xx
                                                      ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50'
                                                      : is4xx
                                                      ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50'
                                                      : 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/50'
                                                  }`}
                                                >
                                                  <div className="flex items-center gap-2 mb-2">
                                                    <span
                                                      className={`text-xs font-bold px-2.5 py-1 rounded-md text-white ${
                                                        is2xx
                                                          ? 'bg-emerald-600'
                                                          : is4xx
                                                          ? 'bg-amber-600'
                                                          : 'bg-rose-600'
                                                      }`}
                                                    >
                                                      {statusCode}
                                                    </span>
                                                    <span className="text-slate-900 dark:text-slate-100 text-xs font-bold">
                                                      {statusCode === '200'
                                                        ? 'OK / Success'
                                                        : statusCode === '201'
                                                        ? 'Created'
                                                        : statusCode === '204'
                                                        ? 'No Content'
                                                        : statusCode === '400'
                                                        ? 'Bad Request'
                                                        : statusCode === '401'
                                                        ? 'Unauthorized'
                                                        : statusCode === '403'
                                                        ? 'Forbidden'
                                                        : statusCode === '404'
                                                        ? 'Not Found'
                                                        : statusCode === '500'
                                                        ? 'Internal Server Error'
                                                        : 'Response'}
                                                    </span>
                                                  </div>
                                                  <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                                                    {((response as Record<string, unknown>)?.description as string) || 'No description provided.'}
                                                  </p>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ApiExplorerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 dark:border-blue-400" />
        </div>
      }
    >
      <ApiExplorerContent />
    </Suspense>
  );
}
