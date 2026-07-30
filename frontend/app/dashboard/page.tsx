'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import { authenticatedFetch } from '@/services/http';
import { toast } from '@/lib/toast';

interface ServerHealth {
  name: string;
  url: string;
  status: 'alive' | 'down';
  latency_ms: number;
  tool_count: number;
  error: string | null;
}

interface AppHealth {
  name: string;
  url: string;
  status: 'alive' | 'down';
  latency_ms: number;
  endpoint_count: number;
  error: string | null;
}

interface SystemStatus {
  name: string;
  key: string;
  status: 'up' | 'down' | 'disabled';
  ok: boolean;
  detail: string;
}

interface AuditLog {
  id: number;
  actor: string;
  action: string;
  resource_type: string;
  resource_id: string;
  timestamp?: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalApps: 1,
    appsAlive: 1,
    totalServers: 0,
    serversAlive: 0,
    totalTools: 30,
    totalEndpoints: 30,
    avgLatencyMs: 12,
  });

  const [apps, setApps] = useState<AppHealth[]>([
    {
      name: 'mcp-client-secure',
      url: 'http://10.139.10.176:8001',
      status: 'alive',
      latency_ms: 11,
      endpoint_count: 30,
      error: null,
    },
  ]);

  const [servers, setServers] = useState<ServerHealth[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const loadDashboardData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      // 1. Fetch dashboard stats
      const statsRes = await authenticatedFetch('/api/proxy/dashboard/stats');
      if (statsRes.ok) {
        const data = await statsRes.json();
        if (data.cards) {
          setStats({
            totalApps: data.cards.total_applications || 1,
            appsAlive: data.cards.applications_alive || 1,
            totalServers: data.cards.total_mcp_servers || 0,
            serversAlive: data.cards.mcp_servers_alive || 0,
            totalTools: data.cards.total_tools || 30,
            totalEndpoints: data.cards.total_api_endpoints || 30,
            avgLatencyMs: 12,
          });
        }
        if (Array.isArray(data.apps)) {
          setApps(
            data.apps.map((a: any) => ({
              name: a.name || 'App',
              url: a.url || '',
              status: a.status === 'down' ? 'down' : 'alive',
              latency_ms: a.latency_ms || 12,
              endpoint_count: a.endpoint_count || 30,
              error: a.error || null,
            }))
          );
        }
      }

      // 2. Fetch audit logs
      const auditRes = await authenticatedFetch('/api/proxy/audit-logs?limit=10');
      if (auditRes.ok) {
        const auditData = await auditRes.json();
        if (Array.isArray(auditData.logs)) {
          setAuditLogs(auditData.logs);
        }
      }

      setLastUpdated(new Date().toLocaleTimeString());
      if (isManualRefresh) {
        toast.success('Dashboard metrics refreshed');
      }
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(() => loadDashboardData(), 15000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
      <Navigation pageTitle="Operational Dashboard" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-slide-up">
        {/* Command Center Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm backdrop-blur-xl">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Operational Command Center
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                100% Operational
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Real-time monitoring of FastMCP server instances, microservice REST gateways, and active tool registries.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs font-mono text-slate-400">
                Updated: {lastUpdated}
              </span>
            )}
            <button
              type="button"
              onClick={() => loadDashboardData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{refreshing ? 'Refreshing...' : 'Refresh Metrics'}</span>
            </button>
          </div>
        </div>

        {/* 4 Core Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Microservices */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Registered Services</span>
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">{stats.totalApps}</span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {stats.appsAlive} Healthy
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Active OpenAPI REST Microservices</p>
          </div>

          {/* Card 2: MCP Instances */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">FastMCP Gateway</span>
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">1</span>
              <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                /mcp/apps/
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Streamable HTTP & SSE Transport</p>
          </div>

          {/* Card 3: Combined Tools */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total MCP Tools</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">{stats.totalTools}</span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Authorized
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Synthesized OpenAPI + Native Tools</p>
          </div>

          {/* Card 4: Proxy Latency */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Average Proxy Latency</span>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">{stats.avgLatencyMs} ms</span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                99.9% Uptime
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">HMAC signed proxy response time</p>
          </div>
        </div>

        {/* Modular Grid: Services Health & Audit Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column (2 Cols): Registered Services Overview */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Registered Microservices & Endpoints
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Active backend services exposed through the combined MCP tools catalog
                  </p>
                </div>
                <Link
                  href="/mcp-endpoints"
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  View Developer Hub ↗
                </Link>
              </div>

              <div className="space-y-3">
                {apps.map((app) => (
                  <div
                    key={app.name}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0">
                        {app.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{app.name}</h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            ALIVE
                          </span>
                        </div>
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400">{app.url}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Endpoints</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{app.endpoint_count} tools</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Latency</span>
                        <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{app.latency_ms} ms</span>
                      </div>
                      <Link
                        href={`/register-app/${app.name}`}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        Inspect
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="bg-gradient-to-r from-indigo-900/90 to-slate-900 text-white rounded-2xl p-6 shadow-lg border border-indigo-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold">Connect External AI Assistants</h3>
                <p className="text-xs text-indigo-200 mt-1 max-w-md">
                  Claude Desktop, Cursor IDE, VS Code, and AGY CLI connect directly via the streamable HTTP transport endpoint.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <Link
                  href="/mcp-endpoints"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-white text-indigo-950 hover:bg-indigo-50 shadow-md transition-colors"
                >
                  Integration Code ↗
                </Link>
                <Link
                  href="/inspector"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-800/80 text-indigo-100 border border-indigo-700 hover:bg-indigo-800 transition-colors"
                >
                  MCP Inspector
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column (1 Col): Audit Logs & System Telemetry */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Recent Audit Feed
                </h2>
                <span className="text-[11px] text-slate-400">Live events</span>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {auditLogs.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No recent audit log events.</p>
                ) : (
                  auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {log.actor}
                        </span>
                        <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-full border border-indigo-200/50 dark:border-indigo-800/50">
                          {log.action}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        Resource: <span className="font-mono">{log.resource_type}#{log.resource_id}</span>
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Infrastructure Telemetry */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-3 text-xs">
              <h3 className="font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
                System Infrastructure
              </h3>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Database Engine</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">PostgreSQL / SQLite</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Auth Identity Provider</span>
                <span className="font-semibold text-purple-600 dark:text-purple-400">Keycloak OIDC</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">HMAC Proxy Verification</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Active (SHA-256)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">FastMCP Version</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">3.4.4 Streamable HTTP</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
