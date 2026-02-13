'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/ui/Card';
import Navigation from '@/components/Navigation';

const NEXT_PUBLIC_BE_API_URL = process.env.NEXT_PUBLIC_BE_API_URL;

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

export default function ApiExplorerPage() {
  const searchParams = useSearchParams();
  const url = searchParams.get('url') || '';
  const name = searchParams.get('name') || 'API';
  const openapiPath = searchParams.get('openapi_path') || '';

  const [spec, setSpec] = useState<OpenAPISpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pathItems, setPathItems] = useState<PathItem[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const totalOperations = pathItems.reduce((total, item) => total + item.methods.length, 0);

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
        const response = await fetch(`${NEXT_PUBLIC_BE_API_URL}/openapi-spec?${query.toString()}`);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 overflow-hidden">
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
            📚 {name} API Explorer
          </h1>
          <p className="text-slate-600">{url}</p>
          <p className="text-slate-500 text-xs mt-1 font-mono">
            OpenAPI path: {openapiPath.trim() || '/openapi.json (auto)'}
          </p>
        </div>

        {/* Spec Info */}
        {spec?.info && (
          <Card className="bg-white/70 backdrop-blur-xl border border-amber-300/50 mb-8 p-6 shadow-lg shadow-amber-200/30">
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <p className="text-slate-600 text-sm">API Title</p>
                <p className="text-slate-800 text-lg font-semibold">{spec.info.title || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-slate-600 text-sm">Version</p>
                <p className="text-slate-800 text-lg font-semibold">{spec.info.version || 'N/A'}</p>
              </div>
              <div>
                <p className="text-slate-600 text-sm">Total Endpoints</p>
                <p className="text-slate-800 text-lg font-semibold">{totalOperations}</p>
              </div>
            </div>
            {spec.info.description && (
              <p className="text-slate-700 mt-4 text-sm">{spec.info.description}</p>
            )}
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card className="bg-red-100 border border-red-400 p-6 mb-8">
            <p className="text-red-700">
              <span className="font-semibold">Error:</span> {error}
            </p>
          </Card>
        )}

        {/* Loading State */}
        {loading && (
          <Card className="bg-white/70 backdrop-blur-xl border border-slate-200/50 p-12 text-center shadow-lg">
            <div className="inline-flex items-center gap-2">
              <div className="w-4 h-4 bg-amber-500 rounded-full animate-bounce"></div>
              <div className="w-4 h-4 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-4 h-4 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
            </div>
            <p className="text-slate-600 mt-4">Loading API specification...</p>
          </Card>
        )}

        {/* Endpoints */}
        {!loading && !error && pathItems.length === 0 && (
          <Card className="bg-white/70 backdrop-blur-xl border border-slate-200/50 p-8 text-center shadow-lg">
            <p className="text-slate-600">No endpoints found in the OpenAPI specification</p>
          </Card>
        )}

        {!loading && pathItems.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-amber-500 to-emerald-600">
                  <th className="border border-amber-400/50 px-6 py-4 text-left text-white font-semibold">Method</th>
                  <th className="border border-amber-400/50 px-6 py-4 text-left text-white font-semibold">Endpoint</th>
                  <th className="border border-amber-400/50 px-6 py-4 text-left text-white font-semibold">Description</th>
                  <th className="border border-amber-400/50 px-6 py-4 text-left text-white font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {pathItems.map((item, idx) =>
                  item.methods.map((method, methodIdx) => (
                    <tr
                      key={`${idx}-${methodIdx}`}
                      className="border border-slate-200/50 hover:bg-white/50 transition-colors cursor-pointer"
                      onClick={() =>
                        setSelectedMethod(
                          selectedMethod === `${idx}-${methodIdx}` ? null : `${idx}-${methodIdx}`
                        )
                      }
                    >
                      {/* Method */}
                      <td className="border border-slate-200/50 px-6 py-4">
                        <span
                          className={`${methodColors[method.method.toLowerCase()] || 'bg-slate-600'} text-white px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap inline-block shadow-md`}
                        >
                          {method.method}
                        </span>
                      </td>

                      {/* Endpoint */}
                      <td className="border border-slate-200/50 px-6 py-4">
                        <p className="text-slate-800 font-mono text-sm break-all text-blue-600">{item.path}</p>
                      </td>

                      {/* Description */}
                      <td className="border border-slate-200/50 px-6 py-4">
                        <div>
                          {method.summary && <p className="text-slate-700 text-sm font-medium">{method.summary}</p>}
                          {method.description && method.description !== method.summary && (
                            <p className="text-slate-600 text-xs mt-1 line-clamp-2">{method.description}</p>
                          )}
                          {!method.summary && !method.description && (
                            <p className="text-slate-500 text-sm italic">No description</p>
                          )}
                        </div>
                      </td>

                      {/* Expand Button */}
                      <td className="border border-slate-200/50 px-6 py-4 text-center">
                        <button className="cursor-pointer text-blue-600 hover:text-blue-700 transition">
                          <span
                            className={`inline-block transition-transform ${
                              selectedMethod === `${idx}-${methodIdx}` ? 'rotate-180' : ''
                            }`}
                          >
                            ▼
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Details Panel - Below Table */}
            {selectedMethod && (
              <div className="mt-8">
                {pathItems.map((item, idx) =>
                  item.methods.map((method, methodIdx) =>
                    selectedMethod === `${idx}-${methodIdx}` ? (
                      <Card
                        key={`details-${idx}-${methodIdx}`}
                        className="bg-white/70 backdrop-blur-xl border border-emerald-300/50 overflow-hidden shadow-lg shadow-emerald-200/30"
                      >
                        <div className="p-8">
                          <div className="mb-8">
                            <h3 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent mb-2">
                              {item.path}
                            </h3>
                            <p className="text-slate-700">{method.summary || method.description || 'No description'}</p>
                          </div>

                          <div className="grid md:grid-cols-2 gap-8">
                            {/* Parameters */}
                            {method.parameters && method.parameters.length > 0 && (
                              <div>
                                <h4 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                                  <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-lg text-sm">📋</span>
                                  Parameters ({method.parameters.length})
                                </h4>
                                <div className="space-y-2">
                                  {method.parameters.map((param, pIdx) => (
                                    <div
                                      key={pIdx}
                                      className="bg-white/60 hover:bg-white border border-amber-200/50 hover:border-amber-400/60 rounded-lg p-4 transition-all"
                                    >
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-amber-700 font-mono font-semibold">{param.name}</span>
                                        <div className="flex gap-2">
                                          <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-mono">
                                            {param.schema?.type || 'string'}
                                          </span>
                                          {param.required && (
                                            <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-semibold">
                                              ⚠ Required
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <p className="text-slate-600 text-xs">
                                        Location: <span className="text-slate-700 font-mono">{param.in}</span>
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Responses */}
                            {method.responses && Object.keys(method.responses).length > 0 && (
                              <div>
                                <h4 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg text-sm">✓</span>
                                  Responses ({Object.keys(method.responses).length})
                                </h4>
                                <div className="space-y-2">
                                  {Object.entries(method.responses).map(([statusCode, response]) => (
                                    <div
                                      key={statusCode}
                                      className={`border rounded-lg p-4 hover:shadow-lg transition-all ${
                                        statusCode.startsWith('2')
                                          ? 'bg-emerald-100 border-emerald-300/50 hover:bg-emerald-100/80'
                                          : statusCode.startsWith('4')
                                            ? 'bg-amber-100 border-amber-300/50 hover:bg-amber-100/80'
                                            : 'bg-red-100 border-red-300/50 hover:bg-red-100/80'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 mb-2">
                                        <span
                                          className={`text-sm font-bold px-3 py-1 rounded-full text-white ${
                                            statusCode.startsWith('2')
                                              ? 'bg-emerald-600'
                                              : statusCode.startsWith('4')
                                                ? 'bg-amber-600'
                                                : 'bg-red-600'
                                          }`}
                                        >
                                          {statusCode}
                                        </span>
                                        <span className="text-slate-700 text-sm font-medium">
                                          {statusCode === '200'
                                            ? 'Success'
                                            : statusCode === '201'
                                              ? 'Created'
                                              : statusCode === '204'
                                                ? 'No Content'
                                                : statusCode === '400'
                                                  ? 'Bad Request'
                                                  : statusCode === '404'
                                                    ? 'Not Found'
                                                    : statusCode === '500'
                                                      ? 'Server Error'
                                                      : 'Response'}
                                        </span>
                                      </div>
                                      <p className="text-slate-600 text-xs">
                                        {(response as Record<string, unknown>)?.description || 'No description provided'}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    ) : null
                  )
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
