'use client';

import { useState, useEffect, Suspense, Fragment } from 'react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/ui/Card';
import Navigation from '@/components/Navigation';
import { publicEnv } from '@/lib/env';
import { authenticatedFetch } from '@/services/http';

const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL

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

const methodColors: Record<string, string> = {
  get: 'bg-blue-600',
  post: 'bg-green-600',
  put: 'bg-yellow-600',
  patch: 'bg-orange-600',
  delete: 'bg-red-600',
  head: 'bg-purple-600',
  options: 'bg-slate-600',
};

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
          const bodySchema = resolveSchema(methodObj.requestBody?.content?.['application/json']?.schema);
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

        // Fetch spec via backend proxy to avoid browser CORS restrictions.
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

        // Parse paths and methods
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
      const res = await fetch(`/api/proxy${proxyPath}`, {
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
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 overflow-hidden text-slate-900 dark:text-slate-100">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-80 h-80 bg-amber-400/5 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-emerald-400/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-blue-400/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Navigation */}
      <Navigation pageTitle="API Explorer" />

      {/* Main Content */}
      <main className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-amber-600 to-emerald-600 bg-clip-text text-transparent mb-2">
            📖 {name} API Explorer
          </h1>
          <p className="text-slate-600 dark:text-slate-400">{url}</p>
          <p className="text-slate-500 dark:text-slate-500 text-xs mt-1 font-mono">
            OpenAPI path: {openapiPath.trim() || '/openapi.json (auto)'}
          </p>
        </div>

        {/* Spec Info */}
        {spec?.info && (
          <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-amber-300/50 dark:border-amber-800/30 mb-8 p-6 shadow-lg shadow-amber-200/30 dark:shadow-none">
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-sm">API Title</p>
                <p className="text-slate-800 dark:text-slate-200 text-lg font-semibold">{spec.info.title || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-sm">Version</p>
                <p className="text-slate-800 dark:text-slate-200 text-lg font-semibold">{spec.info.version || 'N/A'}</p>
              </div>
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-sm">Total Endpoints</p>
                <p className="text-slate-800 dark:text-slate-200 text-lg font-semibold">{totalOperations}</p>
              </div>
            </div>
            {spec.info.description && (
              <p className="text-slate-700 dark:text-slate-300 mt-4 text-sm">{spec.info.description}</p>
            )}
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card className="bg-red-100 dark:bg-red-950/30 border border-red-400 dark:border-red-900 p-6 mb-8">
            <p className="text-red-700 dark:text-red-400">
              <span className="font-semibold">Error:</span> {error}
            </p>
          </Card>
        )}

        {/* Loading State */}
        {loading && (
          <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 p-12 text-center shadow-lg">
            <div className="inline-flex items-center gap-2">
              <div className="w-4 h-4 bg-amber-500 rounded-full animate-bounce"></div>
              <div className="w-4 h-4 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-4 h-4 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mt-4">Loading API specification...</p>
          </Card>
        )}

        {/* Endpoints */}
        {!loading && !error && pathItems.length === 0 && (
          <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 p-8 text-center shadow-lg">
            <p className="text-slate-600 dark:text-slate-400">No endpoints found in the OpenAPI specification</p>
          </Card>
        )}

        {!loading && pathItems.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200/50 dark:border-slate-800 shadow-md">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-amber-500 to-emerald-600">
                  <th className="px-6 py-4 text-left text-white font-semibold">Method</th>
                  <th className="px-6 py-4 text-left text-white font-semibold">Endpoint</th>
                  <th className="px-6 py-4 text-left text-white font-semibold">Description</th>
                  <th className="px-6 py-4 text-left text-white font-semibold text-center w-24">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800 bg-white/40 dark:bg-slate-900/40">
                {pathItems.map((item, idx) =>
                  item.methods.map((method, methodIdx) => {
                    const isExpanded = selectedMethod === `${idx}-${methodIdx}`;
                    return (
                      <Fragment key={`${idx}-${methodIdx}`}>
                        <tr
                          className="hover:bg-white/70 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                          onClick={() =>
                            setSelectedMethod(isExpanded ? null : `${idx}-${methodIdx}`)
                          }
                        >
                          {/* Method */}
                          <td className="px-6 py-4">
                            <span
                              className={`${methodColors[method.method.toLowerCase()] || 'bg-slate-600'} text-white px-3 py-1.5 rounded-lg text-xs font-bold font-mono whitespace-nowrap inline-block shadow-sm`}
                            >
                              {method.method}
                            </span>
                          </td>

                          {/* Endpoint */}
                          <td className="px-6 py-4">
                            <p className="font-mono text-sm break-all text-blue-600 dark:text-blue-400 font-semibold">{item.path}</p>
                          </td>

                          {/* Description */}
                          <td className="px-6 py-4">
                            <div>
                              {method.summary && <p className="text-slate-800 dark:text-slate-200 text-sm font-medium">{method.summary}</p>}
                              {method.description && method.description !== method.summary && (
                                <p className="text-slate-600 dark:text-slate-400 text-xs mt-1 line-clamp-2">{method.description}</p>
                              )}
                              {!method.summary && !method.description && (
                                <p className="text-slate-500 dark:text-slate-500 text-sm italic">No description</p>
                              )}
                            </div>
                          </td>

                          {/* Expand Button */}
                          <td className="px-6 py-4 text-center">
                            <button className="cursor-pointer text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition flex items-center justify-center mx-auto">
                              <svg
                                className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'transform rotate-180' : ''}`}
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

                        {/* Inline Details Pane */}
                        {isExpanded && (
                          <tr className="bg-slate-50/30 dark:bg-slate-950/20">
                            <td colSpan={4} className="px-6 py-6 border-t border-b border-slate-200/50 dark:border-slate-800/80">
                              <div className="p-2 space-y-6">
                                <div>
                                  <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Endpoint Details</h4>
                                  <h3 className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent mb-1">
                                    {item.path}
                                  </h3>
                                  <p className="text-slate-700 dark:text-slate-300 text-sm">{method.summary || method.description || 'No description'}</p>
                                </div>

                                <div className="grid md:grid-cols-2 gap-8">
                                  {/* Parameters */}
                                  {method.parameters && method.parameters.length > 0 && (
                                    <div>
                                      <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                                        <span className="bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded text-sm">📋</span>
                                        Parameters ({method.parameters.length})
                                      </h4>
                                      <div className="space-y-2">
                                        {method.parameters.map((param, pIdx) => (
                                          <div
                                            key={pIdx}
                                            className="bg-white/60 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-900 border border-amber-200/50 dark:border-amber-800/30 hover:border-amber-400/60 dark:hover:border-amber-600/30 rounded-lg p-3 transition-all text-xs"
                                          >
                                            <div className="flex items-center justify-between mb-1.5">
                                              <span className="text-amber-700 dark:text-amber-400 font-mono font-semibold">{param.name}</span>
                                              <div className="flex gap-1.5">
                                                <span className="bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-mono">
                                                  {param.schema?.type || 'string'}
                                                </span>
                                                {param.required && (
                                                  <span className="bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded font-semibold">
                                                    ⚠️ Required
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            <p className="text-slate-500 dark:text-slate-450">
                                              Location: <span className="text-slate-600 dark:text-slate-400 font-mono">{param.in}</span>
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Responses */}
                                  {method.responses && Object.keys(method.responses).length > 0 && (
                                    <div>
                                      <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                                        <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded text-sm">✓</span>
                                        Responses ({Object.keys(method.responses).length})
                                      </h4>
                                      <div className="space-y-2">
                                        {Object.entries(method.responses).map(([statusCode, response]) => (
                                          <div
                                            key={statusCode}
                                            className={`border rounded-lg p-3 hover:shadow-md transition-all text-xs ${statusCode.startsWith('2')
                                              ? 'bg-emerald-100/30 dark:bg-emerald-950/10 border-emerald-300/50 dark:border-emerald-800/30 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/20'
                                              : statusCode.startsWith('4')
                                                ? 'bg-amber-100/30 dark:bg-amber-950/10 border-amber-300/50 dark:border-amber-800/30 hover:bg-amber-100/50 dark:hover:bg-amber-950/20'
                                                : 'bg-red-100/30 dark:bg-red-950/10 border-red-300/50 dark:border-red-800/30 hover:bg-red-100/50 dark:hover:bg-red-950/20'
                                              }`}
                                          >
                                            <div className="flex items-center gap-2 mb-1.5">
                                              <span
                                                className={`font-bold px-2 py-0.5 rounded-full text-white ${statusCode.startsWith('2')
                                                  ? 'bg-emerald-600'
                                                  : statusCode.startsWith('4')
                                                    ? 'bg-amber-600'
                                                    : 'bg-red-600'
                                                  }`}
                                              >
                                                {statusCode}
                                              </span>
                                              <span className="text-slate-700 dark:text-slate-300 font-medium">
                                                {statusCode === '200' ? 'Success' : statusCode === '201' ? 'Created' : statusCode === '204' ? 'No Content' : statusCode === '400' ? 'Bad Request' : statusCode === '404' ? 'Not Found' : statusCode === '500' ? 'Server Error' : 'Response'}
                                              </span>
                                            </div>
                                            <p className="text-slate-500 dark:text-slate-400">
                                              {((response as Record<string, unknown>)?.description as string) || 'No description provided'}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Test Request Section (Swagger UI / FastAPI Docs style) */}
                                <div className="border-t border-slate-200 dark:border-slate-800 pt-5 mt-4 space-y-4">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                                      <span className="bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded text-xs">⚡</span>
                                      Test Endpoint (Try It Out)
                                    </h4>
                                    <button
                                      onClick={() => handleExecuteRequest(item, method)}
                                      disabled={testLoading}
                                      className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition disabled:opacity-50 flex items-center gap-2 shadow-sm"
                                    >
                                      {testLoading ? (
                                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                      ) : 'Execute'}
                                    </button>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="space-y-1">
                                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        Query Parameters (Optional)
                                      </label>
                                      <input
                                        type="text"
                                        value={testQueryParams}
                                        onChange={(e) => setTestQueryParams(e.target.value)}
                                        placeholder="e.g. ?limit=10&offset=0"
                                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500/40 outline-none transition-all"
                                      />
                                    </div>

                                    {method.method !== 'GET' && method.method !== 'HEAD' && (
                                      <div className="space-y-1">
                                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                                          Request Body (JSON)
                                        </label>
                                        <textarea
                                          value={testRequestBody}
                                          onChange={(e) => setTestRequestBody(e.target.value)}
                                          placeholder='{"key": "value"}'
                                          rows={4}
                                          className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500/40 outline-none transition-all"
                                        />
                                      </div>
                                    )}
                                  </div>

                                  {testResponse && (
                                    <div className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3 shadow-inner">
                                      <div className="flex items-center justify-between text-xs border-b border-slate-200 dark:border-slate-850 pb-2">
                                        <span className="font-semibold text-slate-500 dark:text-slate-400">Server Response</span>
                                        <div className="flex gap-4 font-semibold">
                                          <span className={`${testResponse.status >= 200 && testResponse.status < 300 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-450'}`}>
                                            Code: {testResponse.status} {testResponse.statusText}
                                          </span>
                                          <span className="text-slate-500 dark:text-slate-400 font-mono">
                                            Time: {testResponse.timeMs}ms
                                          </span>
                                        </div>
                                      </div>
                                      <pre className="text-xs font-mono overflow-auto max-h-64 text-slate-800 dark:text-slate-200 whitespace-pre-wrap bg-white/50 dark:bg-slate-900/50 p-3 rounded-md border border-slate-200/50 dark:border-slate-800/50">
                                        {typeof testResponse.data === 'object' 
                                          ? JSON.stringify(testResponse.data, null, 2) 
                                          : testResponse.data}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ApiExplorerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    }>
      <ApiExplorerContent />
    </Suspense>
  );
}


