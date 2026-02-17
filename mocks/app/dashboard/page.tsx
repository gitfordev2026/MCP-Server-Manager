'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Navigation from '@/components/Navigation';

const NEXT_PUBLIC_BE_API_URL = process.env.NEXT_PUBLIC_BE_API_URL

interface Server {
  name: string;
  url: string;
}

interface BaseURL {
  name: string;
  url: string;
}

export default function DashboardPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [apps, setApps] = useState<BaseURL[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [serversRes, appsRes] = await Promise.all([
          fetch(`${NEXT_PUBLIC_BE_API_URL}/servers`),
          fetch(`${NEXT_PUBLIC_BE_API_URL}/base-urls`),
        ]);
        
        if (!serversRes.ok || !appsRes.ok) throw new Error('Failed to fetch data');
        
        const serversData = await serversRes.json();
        const appsData = await appsRes.json();
        
        setServers(serversData.servers || []);
        setApps(appsData.base_urls || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 dark:from-black dark:via-purple-950 dark:to-black overflow-hidden">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-pink-500/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Navigation */}
      <Navigation pageTitle="Dashboard" />

      {/* Main Content */}
      <main className="pt-24 pb-20 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero Section */}
          <div className="text-center mb-16 animate-slideInUp">
            <h1 className="text-5xl md:text-7xl font-bold mb-6">
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Dashboard
              </span>
            </h1>
            <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto font-light">
              Monitor and manage all your MCP servers in one place. Get real-time insights and control your infrastructure.
            </p>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            {/* Active Servers Card */}
            <div className="group relative animate-slideInUp" style={{ animationDelay: '0.1s' }}>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl border border-blue-500/20 rounded-3xl p-8 hover:border-blue-500/50 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm font-medium">Active Servers</p>
                    <h3 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mt-2">
                      {servers.length}
                    </h3>
                  </div>
                  <div className="text-5xl opacity-20">🖥️</div>
                </div>
                <div className="mt-4 h-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full w-full"></div>
              </div>
            </div>

            {/* Status Card */}
            <div className="group relative animate-slideInUp" style={{ animationDelay: '0.2s' }}>
              <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-emerald-600 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl border border-green-500/20 rounded-3xl p-8 hover:border-green-500/50 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm font-medium">System Status</p>
                    <h3 className="text-5xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent mt-2">
                      ✓ Online
                    </h3>
                  </div>
                  <div className="text-5xl opacity-20">✨</div>
                </div>
                <div className="mt-4 h-1 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full w-full"></div>
              </div>
            </div>

            {/* Performance Card */}
            <div className="group relative animate-slideInUp" style={{ animationDelay: '0.3s' }}>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl border border-purple-500/20 rounded-3xl p-8 hover:border-purple-500/50 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm font-medium">Performance</p>
                    <h3 className="text-5xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mt-2">
                      99.9%
                    </h3>
                  </div>
                  <div className="text-5xl opacity-20">⚡</div>
                </div>
                <div className="mt-4 h-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full w-full"></div>
              </div>
            </div>
          </div>

          {/* Servers Section */}
          <div className="animate-slideInUp" style={{ animationDelay: '0.4s' }}>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold text-white mb-2">Registered Servers</h2>
                <p className="text-slate-400">View all your MCP servers</p>
              </div>
              <Link href="/register-server">
                <Button className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 px-6 py-3 rounded-xl font-bold transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/50 hover:scale-105">
                  ➕ Add Server
                </Button>
              </Link>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="inline-block">
                    <div className="w-16 h-16 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                  </div>
                  <p className="text-slate-400 mt-4">Loading servers...</p>
                </div>
              </div>
            ) : error ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center">
                <p className="text-red-400 font-medium">⚠️ {error}</p>
              </div>
            ) : servers.length === 0 ? (
              <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-purple-500/20 rounded-3xl p-12 text-center">
                <div className="text-6xl mb-4">🖥️</div>
                <h3 className="text-2xl font-bold text-white mb-2">No Servers Yet</h3>
                <p className="text-slate-400 mb-6">Get started by registering your first MCP server</p>
                <Link href="/register-server">
                  <Button className="bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 px-8 py-3 rounded-xl font-bold transition-all duration-300 hover:shadow-lg hover:scale-105">
                    Register First Server
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {servers.map((server, index) => (
                  <div
                    key={server.name}
                    className="group relative animate-slideInUp"
                    style={{ animationDelay: `${0.5 + index * 0.1}s` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="relative bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl border border-purple-500/20 rounded-2xl p-6 hover:border-purple-500/50 transition-all duration-300 h-full">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg">
                          <span className="text-2xl">🌐</span>
                        </div>
                        <div className="px-3 py-1 bg-green-500/20 border border-green-500/50 rounded-full">
                          <span className="text-xs font-bold text-green-400">Active</span>
                        </div>
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2 truncate">{server.name}</h3>
                      <p className="text-slate-400 text-sm mb-4 truncate">{server.url}</p>
                      <div className="flex gap-3">
                        <button className="cursor-pointer flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-2 rounded-lg font-medium transition-all duration-300 hover:shadow-lg text-sm">
                          View Details
                        </button>
                        <button className="cursor-pointer bg-slate-700/50 hover:bg-slate-600/50 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 text-sm border border-slate-600/50">
                          ⋮
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Apps Section */}
          <div className="mt-20 animate-slideInUp" style={{ animationDelay: '0.5s' }}>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold text-white mb-2">Registered Applications</h2>
                <p className="text-slate-400">Manage your application base URLs</p>
              </div>
              <Link href="/register-app">
                <Button className="bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 px-6 py-3 rounded-xl font-bold transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/50 hover:scale-105">
                  ➕ Add App
                </Button>
              </Link>
            </div>

            {apps.length === 0 ? (
              <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-blue-500/20 rounded-3xl p-12 text-center">
                <div className="text-6xl mb-4">🔌</div>
                <h3 className="text-2xl font-bold text-white mb-2">No Apps Yet</h3>
                <p className="text-slate-400 mb-6">Get started by registering your first application base URL</p>
                <Link href="/register-app">
                  <Button className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700 px-8 py-3 rounded-xl font-bold transition-all duration-300 hover:shadow-lg hover:scale-105">
                    Register First App
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {apps.map((app, index) => (
                  <Link key={app.name} href={`/api-explorer?url=${encodeURIComponent(app.url)}&name=${encodeURIComponent(app.name)}`}>
                    <div
                      className="group relative animate-slideInUp h-full cursor-pointer"
                      style={{ animationDelay: `${0.6 + index * 0.1}s` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      <div className="relative bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl border border-blue-500/20 rounded-2xl p-6 hover:border-blue-500/50 transition-all duration-300 h-full flex flex-col">
                        <div className="flex items-start justify-between mb-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg">
                            <span className="text-2xl">🔌</span>
                          </div>
                          <div className="px-3 py-1 bg-cyan-500/20 border border-cyan-500/50 rounded-full">
                            <span className="text-xs font-bold text-cyan-400">Active</span>
                          </div>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2 truncate">{app.name}</h3>
                        <p className="text-slate-400 text-sm mb-3 truncate">{app.url}</p>
                        <p className="text-xs text-slate-500 mb-4 flex-1">
                          {app.url.endsWith('/') ? `${app.url}openapi.json` : `${app.url}/openapi.json`}
                        </p>
                        <div className="flex gap-3 mt-auto">
                          <button className="cursor-pointer flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-2 rounded-lg font-medium transition-all duration-300 hover:shadow-lg text-sm">
                            View API
                          </button>
                          <button className="cursor-pointer bg-slate-700/50 hover:bg-slate-600/50 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 text-sm border border-slate-600/50">
                            ⋮
                          </button>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Features Section */}
          <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 animate-slideInUp" style={{ animationDelay: '0.6s' }}>
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-blue-500/20 rounded-2xl p-6 hover:border-blue-500/50 transition-all duration-300">
              <div className="text-3xl mb-4">🔍</div>
              <h3 className="text-lg font-bold text-white mb-2">Real-time Monitoring</h3>
              <p className="text-slate-400 text-sm">Monitor your servers in real-time with detailed metrics and insights</p>
            </div>
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-purple-500/20 rounded-2xl p-6 hover:border-purple-500/50 transition-all duration-300">
              <div className="text-3xl mb-4">⚙️</div>
              <h3 className="text-lg font-bold text-white mb-2">Easy Management</h3>
              <p className="text-slate-400 text-sm">Manage all your MCP servers from a single, intuitive dashboard</p>
            </div>
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-pink-500/20 rounded-2xl p-6 hover:border-pink-500/50 transition-all duration-300">
              <div className="text-3xl mb-4">🚀</div>
              <h3 className="text-lg font-bold text-white mb-2">Performance</h3>
              <p className="text-slate-400 text-sm">Optimize and scale your servers for maximum performance</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
