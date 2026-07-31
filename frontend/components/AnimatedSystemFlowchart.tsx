"use client";

import React, { useState, useEffect } from "react";

interface FlowStep {
  id: number;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  badge: string;
  description: string;
  technicalDetails: {
    protocol: string;
    authCheck: string;
    payload: string;
    securityAction: string;
  };
}

const FLOW_STEPS: FlowStep[] = [
  {
    id: 1,
    title: "Client & AI Assistant",
    subtitle: "Public Visitors & Claude Desktop / Cursor",
    icon: "🌐",
    color: "from-blue-500 to-indigo-600",
    badge: "STAGE 1 • INGRESS",
    description: "Requests originate from web browser clients or AI tools (Claude, Cursor, custom SDKs) attempting to access endpoints or invoke tools.",
    technicalDetails: {
      protocol: "HTTPS / Streamable HTTP (JSON-RPC 2.0)",
      authCheck: "Bearer JWT in Auth Header or Query Token",
      payload: "{ jsonrpc: '2.0', method: 'tools/call', params: {...} }",
      securityAction: "Ingress TLS termination & IP validation",
    },
  },
  {
    id: 2,
    title: "AuthGuard & Maintenance Gatekeeper",
    subtitle: "Root Gating & Secret Admin Route",
    icon: "🛡️",
    color: "from-amber-500 to-orange-600",
    badge: "STAGE 2 • GATEKEEPER",
    description: "Evaluates global Maintenance Mode status. Blocks public traffic & Keycloak redirects when maintenance is ON, while preserving secret /new admin access.",
    technicalDetails: {
      protocol: "Client & Edge Middleware Execution",
      authCheck: "System Maintenance Toggle & Role Check",
      payload: "Maintenance Status: ENABLED/DISABLED",
      securityAction: "Blocks non-admin Keycloak redirects if maintenance is active",
    },
  },
  {
    id: 3,
    title: "Keycloak OIDC Realm",
    subtitle: "Identity Provider & Role Enforcement",
    icon: "🔑",
    color: "from-purple-500 to-pink-600",
    badge: "STAGE 3 • AUTHENTICATION",
    description: "Verifies user identity, token expiration, and extracts primary RBAC roles (admin, super_admin, developer, operator).",
    technicalDetails: {
      protocol: "OpenID Connect 1.0 (JWT Validation)",
      authCheck: "RSA Public Key Signature Verification",
      payload: "Decoded Claims: { sub, roles: ['admin'], exp }",
      securityAction: "Rejects expired or tampered Bearer tokens with 401 Unauthorized",
    },
  },
  {
    id: 4,
    title: "FastAPI Control Plane",
    subtitle: "HMAC Proxy & Endpoint Access Policies",
    icon: "⚡",
    color: "from-emerald-500 to-teal-600",
    badge: "STAGE 4 • POLICY ENGINE",
    description: "Evaluates per-endpoint RBAC policies (Allow/Deny matrix per user/group) and signs internal backend requests with HMAC-SHA256 headers.",
    technicalDetails: {
      protocol: "FastAPI Async Router (:8000)",
      authCheck: "Database Policy Matrix (Owner & Endpoint Policies)",
      payload: "X-Internal-HMAC: sha256_signature",
      securityAction: "Enforces fine-grained tool invocation access rules",
    },
  },
  {
    id: 5,
    title: "FastMCP Server Registry",
    subtitle: "Microservice Apps & Dynamic Tool Execution",
    icon: "🚀",
    color: "from-cyan-500 to-blue-600",
    badge: "STAGE 5 • EXECUTION",
    description: "Executes target MCP tools (Analytics, Inventory, Portal Apps, OpenAPI endpoints) and returns structured JSON-RPC responses.",
    technicalDetails: {
      protocol: "FastMCP v3.4.4 ASGI Application (/mcp/apps/)",
      authCheck: "Validated HMAC Signature Check",
      payload: "{ jsonrpc: '2.0', result: { content: [...] }, id: 1 }",
      securityAction: "Isolated container sandbox execution",
    },
  },
];

export default function AnimatedSystemFlowchart() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [mode, setMode] = useState<"normal" | "maintenance">("normal");

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev >= FLOW_STEPS.length ? 1 : prev + 1));
    }, 3200);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const currentStepData = FLOW_STEPS.find((s) => s.id === activeStep) || FLOW_STEPS[0];

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden text-slate-100 font-sans my-8">
      {/* Background Ambient Grid Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none" />
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Control Header */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 tracking-wider uppercase">
              INTERACTIVE ARCHITECTURE FLOWCHART
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE ANIMATED GRAPHIC
            </span>
          </div>
          <h3 className="text-xl font-extrabold text-white tracking-tight">
            MCP Server Manager Data & Security Pipeline
          </h3>
          <p className="text-xs text-slate-400">
            Interactive representation of request flow from client ingress to FastMCP tool execution.
          </p>
        </div>

        {/* Playback Controls & Mode Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode Switcher */}
          <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center text-xs font-semibold">
            <button
              onClick={() => setMode("normal")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                mode === "normal"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Normal Mode
            </button>
            <button
              onClick={() => setMode("maintenance")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                mode === "maintenance"
                  ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              ⚠️ Maintenance Mode
            </button>
          </div>

          {/* Animation Toggle */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            {isPlaying ? "⏸️ Pause" : "▶️ Auto Play"}
          </button>
        </div>
      </div>

      {/* Main Animated Flowchart Node Graph */}
      <div className="relative z-10 py-8">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative">

          {FLOW_STEPS.map((step, index) => {
            const isActive = activeStep === step.id;
            const isBlocked = mode === "maintenance" && step.id >= 3;

            return (
              <div key={step.id} className="relative flex flex-col items-center">
                {/* Node Box */}
                <button
                  onClick={() => {
                    setActiveStep(step.id);
                    setIsPlaying(false);
                  }}
                  className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 relative group cursor-pointer backdrop-blur-xl ${
                    isActive
                      ? `bg-slate-800/90 border-indigo-500 shadow-xl shadow-indigo-500/20 scale-[1.03] ring-2 ring-indigo-500/50`
                      : isBlocked
                      ? "bg-slate-950/60 border-amber-500/30 opacity-60"
                      : "bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50"
                  }`}
                >
                  {/* Step Number Circle */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="w-7 h-7 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center font-mono font-bold text-xs text-indigo-400">
                      0{step.id}
                    </span>
                    <span className="text-xl">{step.icon}</span>
                  </div>

                  <h4 className="text-xs font-bold text-white tracking-tight line-clamp-1">
                    {step.title}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                    {step.subtitle}
                  </p>

                  {/* Mode Warning Indicator */}
                  {mode === "maintenance" && step.id === 2 && (
                    <span className="mt-2 inline-block text-[9px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                      STOP & GATEWAY ONLY
                    </span>
                  )}
                  {mode === "maintenance" && isBlocked && (
                    <span className="mt-2 inline-block text-[9px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30">
                      BLOCKED FOR PUBLIC
                    </span>
                  )}

                  {/* Active Pulse Glow Bar */}
                  {isActive && (
                    <div className="absolute bottom-0 left-4 right-4 h-1 bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full animate-pulse" />
                  )}
                </button>

                {/* Flow Connector Arrow (Horizontal for MD screens) */}
                {index < FLOW_STEPS.length - 1 && (
                  <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 items-center justify-center">
                    <div className="w-6 h-0.5 bg-slate-800 relative">
                      {/* Active Packet Animation Dot */}
                      {isActive && !isBlocked && (
                        <span className="absolute -top-1 left-0 w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-md shadow-cyan-400 animate-ping" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Technical Detail Card for Active Stage */}
      <div className="relative z-10 bg-slate-950/90 border border-slate-800 rounded-2xl p-5 sm:p-6 backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-xl">
              {currentStepData.icon}
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-indigo-400 tracking-wider">
                {currentStepData.badge}
              </span>
              <h4 className="text-base font-bold text-white tracking-tight">
                {currentStepData.title}
              </h4>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {FLOW_STEPS.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setActiveStep(s.id);
                  setIsPlaying(false);
                }}
                className={`w-3 h-3 rounded-full transition-all cursor-pointer ${
                  activeStep === s.id
                    ? "bg-indigo-500 scale-125 ring-2 ring-indigo-500/50"
                    : "bg-slate-800 hover:bg-slate-700"
                }`}
              />
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-300 mb-4 leading-relaxed">
          {currentStepData.description}
        </p>

        {/* Technical Deep Dive Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 font-mono text-[11px]">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-1">
            <span className="text-[10px] text-slate-400 font-sans font-semibold uppercase">
              Transport / Protocol
            </span>
            <p className="text-slate-200 font-bold truncate">
              {currentStepData.technicalDetails.protocol}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-1">
            <span className="text-[10px] text-slate-400 font-sans font-semibold uppercase">
              Security / Auth Check
            </span>
            <p className="text-emerald-400 font-bold truncate">
              {currentStepData.technicalDetails.authCheck}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-1">
            <span className="text-[10px] text-slate-400 font-sans font-semibold uppercase">
              Security Action
            </span>
            <p className="text-cyan-400 font-bold truncate">
              {currentStepData.technicalDetails.securityAction}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-1 col-span-1">
            <span className="text-[10px] text-slate-400 font-sans font-semibold uppercase">
              Sample Payload / Schema
            </span>
            <p className="text-amber-400 font-bold truncate">
              {currentStepData.technicalDetails.payload}
            </p>
          </div>
        </div>
      </div>

      {/* Executive Key Value Propositions Footer */}
      <div className="relative z-10 mt-6 pt-4 border-t border-slate-800/80 grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-xs">
        <div>
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Latency Target</span>
          <p className="font-extrabold text-white text-sm mt-0.5">&lt; 2ms Ingestion</p>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Protocol Support</span>
          <p className="font-extrabold text-indigo-400 text-sm mt-0.5">FastMCP 3.4.4</p>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Auth standard</span>
          <p className="font-extrabold text-emerald-400 text-sm mt-0.5">Keycloak 26 OIDC</p>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Deployment</span>
          <p className="font-extrabold text-cyan-400 text-sm mt-0.5">Airgapped Docker</p>
        </div>
      </div>
    </div>
  );
}
