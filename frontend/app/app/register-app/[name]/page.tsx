'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Navigation from '@/components/Navigation';
import { publicEnv } from '@/lib/env';



const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL


interface BaseURL {
  name: string;
  url: string;
}

export default function AppDetailsPage() {
  const params = useParams();
  const name = params.name as string;

  const [allApps, setAllApps] = useState<BaseURL[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApps();
  }, []);

  const fetchApps = async () => {
    try {
      const response = await fetch(`${NEXT_PUBLIC_BE_API_URL}/base-urls`);
      const data = await response.json();
      setAllApps(data.base_urls || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch apps');
      console.error('Error fetching apps:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 p-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin">
              <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-500 rounded-full"></div>
            </div>
            <span className="ml-4 text-slate-600 font-medium">Loading apps...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 overflow-hidden">
      {/* Background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-80 h-80 bg-blue-400/8 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-blue-400/8 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-emerald-400/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Navigation */}
      <Navigation pageTitle="App Details" />

      {/* Main Content */}
      <main className="pt-24 pb-20 relative z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8 animate-slideInUp">
            <Link href="/register-app" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold mb-4 transition-colors">
              <span>←</span>
              <span>Back to All Apps</span>
            </Link>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-2">Registered Applications</h1>
            <p className="text-lg text-slate-600">Click on any app to explore its API endpoints</p>
          </div>

          {error && (
            <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 font-semibold">⚠️ {error}</p>
            </div>
          )}

          {/* Apps List */}
          {allApps.length === 0 ? (
            <div className="bg-white/70 backdrop-blur-xl border border-blue-300/50 rounded-2xl p-12 text-center shadow-lg">
              <p className="text-slate-600 text-lg">No apps registered yet</p>
              <p className="text-slate-500 text-sm mt-2">Go to Register App to add your first application</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {allApps.map((app, index) => (
                <Link
                  key={app.name}
                  href={`/api-explorer?url=${encodeURIComponent(app.url)}&name=${encodeURIComponent(app.name)}`}
                >
                  <div
                    className="group relative h-full bg-white/70 hover:bg-white/80 border border-blue-300/50 hover:border-blue-500/60 transition-all duration-300 cursor-pointer rounded-2xl p-6 backdrop-blur-xl animate-slideInUp shadow-md hover:shadow-lg hover:shadow-blue-300/40 hover:-translate-y-1"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl blur-lg opacity-0 group-hover:opacity-20 transition-opacity duration-500"></div>
                    
                    <div className="relative">
                      {/* Header with Icon */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="font-bold text-slate-800 text-xl group-hover:text-blue-600 transition-colors">
                            {app.name}
                          </h3>
                          <p className="text-slate-500 text-sm mt-2">Application Base URL</p>
                        </div>
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                          <span className="text-lg">🔌</span>
                        </div>
                      </div>

                      {/* URL Display */}
                      <div className="bg-slate-50 rounded-lg p-3 mb-4 border border-slate-200 group-hover:border-blue-300 transition-colors">
                        <p className="text-xs text-slate-500 font-semibold mb-1">Base URL</p>
                        <p className="text-slate-700 font-mono text-xs break-all group-hover:text-blue-700 transition-colors">
                          {app.url}
                        </p>
                      </div>

                      {/* API Endpoint Preview */}
                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 group-hover:border-blue-400 transition-colors">
                        <p className="text-xs text-blue-600 font-semibold mb-1">API Endpoint</p>
                        <p className="text-slate-700 font-mono text-xs break-all">
                          {app.url.endsWith('/') ? `${app.url}openapi.json` : `${app.url}/openapi.json`}
                        </p>
                      </div>

                      {/* Footer */}
                      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs text-slate-500">Click to view API details</span>
                        <span className="text-blue-600 font-bold group-hover:translate-x-1 transition-transform">→</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
