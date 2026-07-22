'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';

interface Stage {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  badge: string;
  color: string;
  iconSvg: React.ReactNode;
  codeSnippet: string;
  details: { label: string; value: string }[];
}

const STAGES: Stage[] = [
  {
    id: 'openapi',
    number: '01',
    title: 'OpenAPI Spec',
    subtitle: 'Register REST APIs',
    badge: 'Swagger 3.0',
    color: '#3b82f6',
    iconSvg: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    codeSnippet: `GET /api/v1/payments
Host: api.enterprise.com
OpenAPI 3.0 JSON Registered`,
    details: [
      { label: 'Input Format', value: 'OpenAPI 3.0 / Swagger' },
      { label: 'Endpoints Parsed', value: '14 REST Operations' },
      { label: 'Status', value: 'Synced & Validated' },
    ],
  },
  {
    id: 'parser',
    number: '02',
    title: 'MCP Converter',
    subtitle: 'Synthesize Tools',
    badge: 'Auto Mapping',
    color: '#06b6d4',
    iconSvg: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    codeSnippet: `tools: [
  {
    name: "payments_create",
    description: "Create payment charge",
    inputSchema: { type: "object", properties: {...} }
  }
]`,
    details: [
      { label: 'Conversion Engine', value: 'REST -> JSON-RPC 2.0' },
      { label: 'Schema Validation', value: 'Pydantic Strict' },
      { label: 'Cache TTL', value: '30s (In-Memory / Redis)' },
    ],
  },
  {
    id: 'keycloak',
    number: '03',
    title: 'Keycloak Guard',
    subtitle: 'Zero Trust Auth',
    badge: 'OAuth2 / OIDC',
    color: '#8b5cf6',
    iconSvg: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    codeSnippet: `Authorization: Bearer eyJhbGci...
Client ID: mcp_secure1
Realm: mcp-realm
Status: VERIFIED (RS256)`,
    details: [
      { label: 'Token Verification', value: 'JWKS RS256 Key Ring' },
      { label: 'Claims Checked', value: 'iss, exp, aud, roles' },
      { label: 'RBAC Policy', value: 'mcp:tool:execute ALLOW' },
    ],
  },
  {
    id: 'endpoint',
    number: '04',
    title: 'Unified Gateway',
    subtitle: 'Single Endpoint',
    badge: 'POST /mcp/',
    color: '#10b981',
    iconSvg: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    codeSnippet: `POST /mcp/ HTTP/1.1
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": { "name": "payments_create", "arguments": {...} }
}`,
    details: [
      { label: 'Protocol', value: 'Model Context Protocol (MCP)' },
      { label: 'Transport', value: 'Streamable HTTP / SSE' },
      { label: 'Audit Log ID', value: 'log_9f83a1c4b' },
    ],
  },
  {
    id: 'clients',
    number: '05',
    title: 'AI Clients',
    subtitle: 'Claude, Cursor, Agents',
    badge: 'Connected',
    color: '#f59e0b',
    iconSvg: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    codeSnippet: `Result: {
  "status": "success",
  "payment_id": "pay_987654",
  "amount": 2500,
  "currency": "USD"
}`,
    details: [
      { label: 'Active LLM Session', value: 'Claude Desktop / Cursor' },
      { label: 'Roundtrip Latency', value: '42 ms' },
      { label: 'Execution Result', value: '200 OK (Success)' },
    ],
  },
];

export default function InteractiveFlowDiagram() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  // Auto-cycle through flow steps like LangSmith live trace
  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(() => {
      setActiveStageIndex((prev) => (prev + 1) % STAGES.length);
    }, 3200);
    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  const activeStage = STAGES[activeStageIndex];

  return (
    <div
      className={`w-full max-w-6xl mx-auto my-14 p-6 sm:p-8 md:p-10 lg:p-12 rounded-3xl border shadow-2xl backdrop-blur-2xl transition-colors duration-300 ${
        isDark
          ? 'bg-[#030712]/90 border-slate-800 text-white shadow-blue-500/10'
          : 'bg-white/95 border-slate-200/90 text-slate-900 shadow-slate-200/60'
      }`}
    >
      {/* Header Bar */}
      <div
        className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 mb-8 border-b transition-colors duration-300 ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
            <span
              className={`text-xs font-mono font-bold uppercase tracking-widest ${
                isDark ? 'text-emerald-400' : 'text-emerald-600'
              }`}
            >
              LIVE MCP ARCHITECTURE TRACE
            </span>
          </div>
          <h3 className={`text-2xl sm:text-3xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            How MCP Manager Operates
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsAutoPlaying((prev) => !prev)}
            className={`px-4 py-2 rounded-xl border text-xs font-mono font-semibold transition-all duration-200 cursor-pointer flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
              isDark
                ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 shadow-xs'
                : 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800 shadow-xs'
            }`}
          >
            <span>{isAutoPlaying ? '⏸ Pause Trace' : '▶ Play Trace'}</span>
          </button>
          <span className={`text-xs font-mono font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Step {activeStageIndex + 1} of {STAGES.length}
          </span>
        </div>
      </div>

      {/* Top Track Indicator Line (Placed cleanly ABOVE cards, not slicing through them!) */}
      <div className="relative mb-6">
        <div className="h-1.5 w-full rounded-full bg-slate-800/40 dark:bg-slate-800/80 overflow-hidden relative">
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${((activeStageIndex + 1) / STAGES.length) * 100}%` }}
          />
        </div>
      </div>

      {/* 5 Stage Node Buttons Grid with Generous Outer Margins (mt-8 md:mt-10, mb-14 md:mb-16) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 md:gap-6 mt-8 md:mt-10 mb-14 md:mb-16">
        {STAGES.map((stage, idx) => {
          const isActive = idx === activeStageIndex;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => {
                setActiveStageIndex(idx);
                setIsAutoPlaying(false);
              }}
              className={`relative text-left rounded-2xl p-6 sm:p-7 md:p-8 border cursor-pointer flex flex-col justify-between min-h-[195px] overflow-hidden transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                isActive
                  ? isDark
                    ? 'bg-slate-800/95 border-blue-500 shadow-xl shadow-blue-500/20 ring-2 ring-blue-500/50'
                    : 'bg-blue-50/95 border-blue-600 shadow-xl shadow-blue-500/15 ring-2 ring-blue-500/40'
                  : isDark
                    ? 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-400 hover:bg-slate-800/50'
                    : 'bg-slate-50/90 border-slate-200/90 hover:border-slate-300 text-slate-600 hover:bg-slate-100/80'
              }`}
            >
              {/* Active Accent Top Indicator Bar */}
              {isActive && (
                <div
                  className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400"
                />
              )}

              <div>
                <div className="flex items-center justify-between mb-4">
                  <span
                    className="w-11 h-11 rounded-xl flex items-center justify-center transition-colors"
                    style={{
                      backgroundColor: `${stage.color}20`,
                      color: stage.color,
                    }}
                  >
                    {stage.iconSvg}
                  </span>
                  <span className={`text-xs font-mono font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    {stage.number}
                  </span>
                </div>

                <h4
                  className={`font-extrabold text-base mb-1.5 tracking-tight ${
                    isActive
                      ? isDark
                        ? 'text-white'
                        : 'text-blue-950'
                      : isDark
                        ? 'text-slate-200'
                        : 'text-slate-900'
                  }`}
                >
                  {stage.title}
                </h4>
                <p className={`text-xs font-normal leading-relaxed mb-5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {stage.subtitle}
                </p>
              </div>

              {/* Badge Enclosed Cleanly Inside Card with Bottom Margin */}
              <div className="pt-2 pb-1">
                <span
                  className="inline-block text-[11px] font-mono font-semibold px-3 py-1.5 rounded-lg border shadow-xs"
                  style={{
                    color: stage.color,
                    borderColor: `${stage.color}40`,
                    backgroundColor: `${stage.color}15`,
                  }}
                >
                  {stage.badge}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Inspector Panel */}
      <div
        className={`grid grid-cols-1 lg:grid-cols-2 gap-6 rounded-2xl p-6 md:p-8 border transition-colors duration-300 ${
          isDark
            ? 'bg-slate-950/90 border-slate-800 text-white'
            : 'bg-slate-50/90 border-slate-200/90 text-slate-900 shadow-xs'
        }`}
      >
        {/* Left: Code Snippet */}
        <div className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span
                className={`text-xs font-mono font-bold uppercase tracking-wider ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                Live Inspection Payload
              </span>
              <span
                className="text-xs font-mono px-3 py-1 rounded-md text-white font-bold shadow-xs"
                style={{ backgroundColor: activeStage.color }}
              >
                Stage {activeStage.number}: {activeStage.title}
              </span>
            </div>
            <pre className="p-5 rounded-2xl bg-slate-950 border border-slate-800 text-emerald-400 font-mono text-xs overflow-x-auto leading-relaxed shadow-inner max-h-60">
              <code>{activeStage.codeSnippet}</code>
            </pre>
          </div>
        </div>

        {/* Right: Technical Specs & Execution Details */}
        <div className="flex flex-col justify-between">
          <div>
            <span
              className={`text-xs font-mono font-bold uppercase tracking-wider block mb-4 ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}
            >
              Execution Properties
            </span>
            <div className="space-y-3">
              {activeStage.details.map((detail, dIdx) => (
                <div
                  key={dIdx}
                  className={`flex items-center justify-between py-2.5 border-b text-xs ${
                    isDark ? 'border-slate-800/80' : 'border-slate-200'
                  }`}
                >
                  <span className={`font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {detail.label}
                  </span>
                  <span className={`font-mono font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {detail.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            className={`mt-5 pt-3.5 border-t flex items-center justify-between text-xs font-mono ${
              isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'
            }`}
          >
            <span>Security: Keycloak JWT Guard</span>
            <span className="text-emerald-500 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
