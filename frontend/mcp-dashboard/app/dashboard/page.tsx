'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Navigation from '@/components/Navigation';
import { publicEnv } from '@/lib/env';

const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL;

interface Server {
  name: string;
  url: string;
}

interface BaseURL {
  name: string;
  url: string;
}

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

export default function DashboardPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [apps, setApps] = useState<BaseURL[]>([]);
  const [cards, setCards] = useState<DashboardCards | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [serversRes, appsRes, statsRes] = await Promise.all([
          fetch(`${NEXT_PUBLIC_BE_API_URL}/servers`),
          fetch(`${NEXT_PUBLIC_BE_API_URL}/base-urls`),
          fetch(`${NEXT_PUBLIC_BE_API_URL}/dashboard/stats`),
        ]);

        if (!serversRes.ok || !appsRes.ok || !statsRes.ok) throw new Error('Failed to fetch data');

        const serversData = await serversRes.json();
        const appsData = await appsRes.json();
        const statsData = await statsRes.json();

        setServers(serversData.servers || []);
        setApps(appsData.base_urls || []);
        setCards(statsData?.cards ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
      </div>

      <Navigation pageTitle="Dashboard" />

      <main className="pt-24 pb-20 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 animate-slideInUp">
            <h1 className="text-5xl md:text-7xl font-bold mb-6">
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Dashboard
              </span>
            </h1>
            <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto font-light">
              Monitor MCP mini servers and applications from one place.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            <div className="rounded-3xl p-6 bg-slate-800/80 border border-blue-500/30">
              <p className="text-slate-400 text-sm">Applications</p>
              <p className="text-4xl font-bold text-blue-300 mt-2">{cards?.total_applications ?? apps.length}</p>
              <p className="text-xs text-slate-400 mt-2">{cards?.applications_alive ?? 0} alive / {cards?.applications_down ?? 0} down</p>
            </div>
            <div className="rounded-3xl p-6 bg-slate-800/80 border border-emerald-500/30">
              <p className="text-slate-400 text-sm">MCP Mini Servers</p>
              <p className="text-4xl font-bold text-emerald-300 mt-2">{cards?.total_mcp_servers ?? servers.length}</p>
              <p className="text-xs text-slate-400 mt-2">{cards?.mcp_servers_alive ?? 0} alive / {cards?.mcp_servers_down ?? 0} down</p>
            </div>
            <div className="rounded-3xl p-6 bg-slate-800/80 border border-purple-500/30">
              <p className="text-slate-400 text-sm">MCP Tools</p>
              <p className="text-4xl font-bold text-purple-300 mt-2">{cards?.total_tools ?? 0}</p>
            </div>
            <div className="rounded-3xl p-6 bg-slate-800/80 border border-amber-500/30">
              <p className="text-slate-400 text-sm">API Endpoints</p>
              <p className="text-4xl font-bold text-amber-300 mt-2">{cards?.total_api_endpoints ?? 0}</p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">Registered Mini Servers</h2>
              <p className="text-slate-400">View all registered MCP mini servers</p>
            </div>
            <Link href="/register-server">
              <Button className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white">Add Server</Button>
            </Link>
          </div>

          {loading ? (
            <div className="text-slate-300">Loading...</div>
          ) : error ? (
            <div className="text-red-300">{error}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {servers.map((server) => (
                <div key={server.name} className="bg-slate-800/80 border border-slate-600 rounded-2xl p-6">
                  <h3 className="text-white font-semibold">{server.name}</h3>
                  <p className="text-slate-400 text-sm mt-1 truncate">{server.url}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-16 flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">Registered Applications</h2>
              <p className="text-slate-400">Manage your application base URLs</p>
            </div>
            <Link href="/register-app">
              <Button className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">Add App</Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {apps.map((app) => (
              <Link key={app.name} href={`/api-explorer?url=${encodeURIComponent(app.url)}&name=${encodeURIComponent(app.name)}`}>
                <div className="bg-slate-800/80 border border-slate-600 rounded-2xl p-6 cursor-pointer">
                  <h3 className="text-white font-semibold">{app.name}</h3>
                  <p className="text-slate-400 text-sm mt-1 truncate">{app.url}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
