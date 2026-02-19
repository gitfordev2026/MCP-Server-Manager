'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Navigation from '@/components/Navigation';
import { publicEnv } from '@/lib/env';

const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL


interface BaseURL {
  name: string;
  url: string;
  openapi_path?: string;
  include_unreachable_tools?: boolean;
}

export default function RegisterAppPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [baseURLs, setBaseURLs] = useState<BaseURL[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    url: '',
    openapi_path: '',
    include_unreachable_tools: false,
  });

  useEffect(() => {
    fetchBaseURLs();
  }, []);

  const fetchBaseURLs = async () => {
    try {
      const response = await fetch(`${NEXT_PUBLIC_BE_API_URL}/base-urls`);
      const data = await response.json();
      setBaseURLs(data.base_urls || []);
    } catch (err) {
      console.error('Failed to fetch base URLs:', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked } = e.target;
    setFormData((prev) => {
      if (name === 'include_unreachable_tools') {
        return { ...prev, include_unreachable_tools: checked };
      }
      if (name === 'openapi_path') {
        return { ...prev, openapi_path: value };
      }
      if (name === 'name') {
        return { ...prev, name: value };
      }
      if (name === 'url') {
        return { ...prev, url: value };
      }
      return prev;
    });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${NEXT_PUBLIC_BE_API_URL}/register-base-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.detail || data.error || 'Registration failed');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setFormData({ name: '', url: '', openapi_path: '', include_unreachable_tools: false });
      setTimeout(() => setSuccess(false), 3000);
      fetchBaseURLs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register base URL');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 overflow-hidden">
      {/* Elegant background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-80 h-80 bg-blue-400/8 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-blue-400/8 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-emerald-400/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Navigation */}
      <Navigation pageTitle="Register App" />

      {/* Main Content */}
      <main className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative z-10">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Registration Form */}
          <div className="animate-slideInUp">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent mb-2">Register New App</h2>
            <p className="text-slate-600 mb-6">Add a new application base URL to your hub</p>

            {success && (
              <div className="mb-4 p-4 bg-emerald-100 border border-emerald-400 rounded-lg text-emerald-700 animate-slideInUp">
                ✓ Application registered successfully!
              </div>
            )}

            {error && (
              <div className="mb-4 p-4 bg-red-100 border border-red-400 rounded-lg text-red-700 animate-slideInUp">
                ✗ {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-blue-700 mb-2">Application Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g., My API, Dashboard API"
                  required
                  className="w-full px-4 py-2 bg-white border border-blue-300/50 rounded-xl text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-700 mb-2">Base URL</label>
                <input
                  type="url"
                  name="url"
                  value={formData.url}
                  onChange={handleChange}
                  placeholder="http://localhost:3000 or https://api.example.com"
                  required
                  className="w-full px-4 py-2 bg-white border border-blue-300/50 rounded-xl text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-700 mb-2">Custom OpenAPI Path (optional)</label>
                <input
                  type="text"
                  name="openapi_path"
                  value={formData.openapi_path}
                  onChange={handleChange}
                  placeholder="openapi.json, /swagger/v1/swagger.json, or full URL"
                  className="w-full px-4 py-2 bg-white border border-blue-300/50 rounded-xl text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Leave empty to auto-discover using default `/openapi.json`.
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-blue-200/60 bg-blue-50/60 p-3">
                <input
                  id="include_unreachable_tools"
                  type="checkbox"
                  name="include_unreachable_tools"
                  checked={formData.include_unreachable_tools}
                  onChange={handleChange}
                  className="mt-1 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="include_unreachable_tools" className="text-sm text-blue-800">
                  Include placeholder tool if app is unreachable or has zero exposed endpoints
                </label>
              </div>

              <Button
                type="submit"
                className="cursor-pointer w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-2 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-blue-400/50 hover:scale-105 shadow-md"
              >
                {loading ? '⏳ Registering...' : '✓ Register App'}
              </Button>
            </form>

            <div className="mt-8 bg-white/70 backdrop-blur-xl border border-blue-300/50 rounded-2xl p-6 shadow-lg shadow-blue-200/30">
              <h3 className="text-sm font-semibold text-blue-700 mb-3">📋 App Format Example</h3>
              <div className="space-y-2 text-xs text-slate-600">
                <div>
                  <span className="text-blue-600">Name:</span> <span className="text-slate-700">My Dashboard</span>
                </div>
                <div>
                  <span className="text-blue-600">URL:</span> <span className="text-slate-700">http://localhost:3000</span>
                </div>
              </div>
            </div>
          </div>

          {/* Registered Apps List */}
          <div className="animate-slideInUp" style={{ animationDelay: '0.2s' }}>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent mb-2">Registered Apps</h2>
            <p className="text-slate-600 mb-6">Click on any app to explore its API endpoints</p>

            {baseURLs.length === 0 ? (
              <div className="bg-white/70 backdrop-blur-xl border border-blue-300/50 rounded-2xl p-8 text-center shadow-lg shadow-blue-200/30">
                <p className="text-slate-600">No apps registered yet</p>
                <p className="text-slate-500 text-sm mt-2">Register your first app using the form on the left</p>
              </div>
            ) : (
              <div className="space-y-3">
                {baseURLs.map((app, index) => (
                  <Link
                    key={index}
                    href={
                      `/api-explorer?url=${encodeURIComponent(app.url)}&name=${encodeURIComponent(app.name)}` +
                      (app.openapi_path ? `&openapi_path=${encodeURIComponent(app.openapi_path)}` : '')
                    }
                  >
                    <div className="group relative bg-white/70 hover:bg-white/80 border border-blue-300/50 hover:border-blue-500/60 transition-all duration-300 cursor-pointer rounded-2xl p-4 backdrop-blur-xl animate-slideInUp shadow-md hover:shadow-lg hover:shadow-blue-300/40" style={{ animationDelay: `${0.3 + index * 0.1}s` }}>
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl blur-lg opacity-0 group-hover:opacity-20 transition-opacity duration-500"></div>
                      <div className="relative flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-800 text-lg">{app.name}</h3>
                          <p className="text-slate-600 text-sm mt-1 break-all">{app.url}</p>
                          <p className="text-xs text-slate-500 mt-2 font-mono">
                            {(app.openapi_path && app.openapi_path.trim()) ||
                              (app.url.endsWith('/') ? `${app.url}openapi.json` : `${app.url}/openapi.json`)}
                          </p>
                          <p className="text-xs text-blue-700 mt-1">
                            Placeholder policy: {app.include_unreachable_tools ? 'Enabled' : 'Disabled'}
                          </p>
                        </div>
                        <span className="text-blue-600 ml-4 font-bold">→</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

