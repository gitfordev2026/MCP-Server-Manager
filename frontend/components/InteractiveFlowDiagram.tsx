'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';

interface StepData {
  title: string;
  sub: string;
  icon: 'file' | 'bolt' | 'lock' | 'globe' | 'cpu';
  color: string;
  badge: string;
  payload: string;
  props: [string, string][];
}

const STEPS: StepData[] = [
  {
    title: 'OpenAPI Spec',
    sub: 'Register REST APIs',
    icon: 'file',
    color: '#3b82f6',
    badge: 'Swagger 3.0',
    payload: `GET /openapi.json

{
  "openapi": "3.0.1",
  "paths": { "...": {} },
  "info": { "title": "Payments API" }
}`,
    props: [
      ['Endpoints discovered', '42'],
      ['Spec version', '3.0.1'],
      ['Validation', 'Passed'],
    ],
  },
  {
    title: 'MCP Converter',
    sub: 'Synthesize Tools',
    icon: 'bolt',
    color: '#06b6d4',
    badge: 'Auto Mapping',
    payload: `Synthesizing tool definitions...

{
  "tools_generated": 42,
  "strategy": "auto",
  "schema_drift": "none"
}`,
    props: [
      ['Tools generated', '42'],
      ['Mapping strategy', 'Auto'],
      ['Schema drift', 'None'],
    ],
  },
  {
    title: 'Keycloak Guard',
    sub: 'Zero Trust Auth',
    icon: 'lock',
    color: '#8b5cf6',
    badge: 'OAuth2 / OIDC',
    payload: `POST /realms/mcp/protocol/openid-connect/token

{
  "grant_type": "client_credentials",
  "token_type": "Bearer",
  "expires_in": 300
}`,
    props: [
      ['Token type', 'Bearer JWT'],
      ['Grant type', 'client_credentials'],
      ['Token TTL', '300s'],
    ],
  },
  {
    title: 'Unified Gateway',
    sub: 'Single Endpoint',
    icon: 'globe',
    color: '#10b981',
    badge: 'POST /mcp/',
    payload: `POST /mcp/ HTTP/1.1
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": { "name": "payments_create", "arguments": {...} }
}`,
    props: [
      ['Protocol', 'Model Context Protocol (MCP)'],
      ['Transport', 'Streamable HTTP / SSE'],
      ['Audit log ID', 'log_9f83a1c4b'],
    ],
  },
  {
    title: 'AI Clients',
    sub: 'Claude, Cursor, Agents',
    icon: 'cpu',
    color: '#f59e0b',
    badge: 'Connected',
    payload: `Result: {
  "status": "success",
  "payment_id": "pay_987654",
  "amount": 2500,
  "currency": "USD"
}`,
    props: [
      ['Active LLM session', 'Claude Desktop / Cursor'],
      ['Roundtrip latency', '42 ms'],
      ['Execution result', '200 OK (Success)'],
    ],
  },
];

function renderIconSvg(icon: string) {
  switch (icon) {
    case 'file':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'bolt':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
    case 'lock':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      );
    case 'globe':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      );
    case 'cpu':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function InteractiveFlowDiagram() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [active, setActive] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % STEPS.length);
    }, 3200);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const activeStep = STEPS[active];

  return (
    <div className={`trace-component-wrapper ${isDark ? 'dark-mode' : 'light-mode'}`}>
      <style jsx>{`
        .trace-component-wrapper.dark-mode {
          --bg: #030712;
          --panel: #0f172a;
          --panel-2: #020617;
          --line: #1e293b;
          --line-soft: #1e293b99;
          --text: #ffffff;
          --text-dim: #94a3b8;
          --text-faint: #64748b;
          --focus: #3b82f6;
          --mono: "SFMono-Regular", ui-monospace, Menlo, Consolas, monospace;
          --sans: "Inter", system-ui, -apple-system, Segoe UI, sans-serif;
        }
        .trace-component-wrapper.light-mode {
          --bg: #f8fafc;
          --panel: #ffffff;
          --panel-2: #f1f5f9;
          --line: #e2e8f0;
          --line-soft: #e2e8f0cc;
          --text: #0f172a;
          --text-dim: #475569;
          --text-faint: #94a3b8;
          --focus: #2563eb;
          --mono: "SFMono-Regular", ui-monospace, Menlo, Consolas, monospace;
          --sans: "Inter", system-ui, -apple-system, Segoe UI, sans-serif;
        }

        @keyframes tracePing {
          75%, 100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes tracePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .anim-ping::after {
          content: ""; position: absolute; inset: 0; border-radius: 50%;
          background: inherit; animation: tracePing 1.6s cubic-bezier(0,0,0.2,1) infinite;
        }
        .anim-pulse { animation: tracePulse 1.8s ease-in-out infinite; }
        .fade-in { animation: fadeSlide .35s ease both; }

        .app {
          max-width: 1180px; margin: 0 auto;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 24px;
          box-shadow: 0 25px 60px -20px rgba(59,130,246,0.10);
          padding: clamp(20px, 3vw, 48px);
          overflow: hidden;
          color: var(--text);
          font-family: var(--sans);
        }

        .header {
          display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between;
          padding-bottom: 24px; margin-bottom: 28px; border-bottom: 1px solid var(--line);
        }
        .eyebrow { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .eyebrow .dot-wrap { position: relative; width: 10px; height: 10px; }
        .eyebrow .dot { position: relative; width: 10px; height: 10px; border-radius: 50%; background: #10b981; display: block; }
        .eyebrow span.label { font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: .15em; color: #34d399; text-transform: uppercase; }
        h1 { margin: 0; font-size: clamp(20px, 3vw, 28px); font-weight: 800; color: var(--text); }

        .controls { display: flex; align-items: center; gap: 12px; }
        .pause-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 9px 16px; border-radius: 12px;
          border: 1px solid var(--line);
          background: ${isDark ? '#1e293b' : '#e2e8f0'};
          color: ${isDark ? '#e2e8f0' : '#0f172a'};
          font-family: var(--mono); font-size: 12px; font-weight: 600; cursor: pointer;
          transition: background .2s ease, transform .15s ease;
        }
        .pause-btn:hover { background: ${isDark ? '#334155' : '#cbd5e1'}; }
        .pause-btn:active { transform: scale(0.97); }
        .pause-btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
        .step-count { font-family: var(--mono); font-size: 12px; color: var(--text-dim); }

        /* progress bar */
        .progress-track { height: 6px; border-radius: 99px; background: ${isDark ? '#1e293b66' : '#e2e8f0'}; overflow: hidden; margin-bottom: 28px; }
        .progress-fill {
          height: 100%; border-radius: 99px;
          background: linear-gradient(90deg, #3b82f6, #22d3ee, #34d399);
          transition: width .5s cubic-bezier(.4,0,.2,1);
        }

        .steps {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 20px;
          margin-bottom: 40px;
        }
        .step {
          position: relative; text-align: left; cursor: pointer;
          background: ${isDark ? 'rgba(15,23,42,0.6)' : 'rgba(241,245,249,0.8)'};
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 26px 24px;
          min-height: 195px;
          display: flex; flex-direction: column; justify-content: space-between;
          overflow: hidden;
          color: inherit; font: inherit;
          transition: border-color .2s ease, background .2s ease, transform .2s ease, box-shadow .2s ease;
        }
        .step:hover { border-color: ${isDark ? '#334155' : '#cbd5e1'}; background: ${isDark ? 'rgba(30,41,59,0.5)' : '#e2e8f0'}; transform: translateY(-2px); }
        .step:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
        .step[aria-current="step"] {
          background: ${isDark ? 'rgba(30,41,59,0.95)' : '#eff6ff'};
          border-color: var(--step-color, #3b82f6);
          box-shadow: 0 12px 30px -12px var(--glow, rgba(59,130,246,.35)), 0 0 0 2px var(--ring, rgba(59,130,246,.35));
        }
        .step[aria-current="step"]::before {
          content: ""; position: absolute; inset: 0 0 auto 0; height: 3px;
          background: linear-gradient(90deg, #3b82f6, #22d3ee, #34d399);
        }
        .step-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .icon {
          width: 44px; height: 44px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          background: color-mix(in srgb, var(--step-color) 15%, transparent);
          color: var(--step-color);
          transition: transform .2s ease;
        }
        .step[aria-current="step"] .icon { transform: scale(1.06); }
        .icon :global(svg) { width: 20px; height: 20px; }
        .index { font-family: var(--mono); font-size: 12px; font-weight: 700; color: var(--text-faint); }
        .step-title { font-weight: 800; font-size: 15.5px; margin: 0 0 6px; letter-spacing: -0.01em; }
        .step[aria-current="step"] .step-title { color: ${isDark ? '#fff' : '#0f172a'}; }
        .step:not([aria-current="step"]) .step-title { color: ${isDark ? '#cbd5e1' : '#334155'}; }
        .step-sub { font-size: 12.5px; color: var(--text-dim); margin: 0 0 18px; line-height: 1.5; }
        .badge {
          align-self: flex-start;
          display: inline-flex; align-items: center; gap: 6px;
          font-family: var(--mono); font-size: 11px; font-weight: 700;
          padding: 6px 12px; border-radius: 9px; letter-spacing: .02em;
          background: color-mix(in srgb, var(--step-color) 12%, transparent);
          color: var(--step-color);
          border: 1px solid color-mix(in srgb, var(--step-color) 35%, transparent);
        }
        .step[aria-current="step"] .badge {
          background: var(--step-color); color: #04101c; border-color: var(--step-color);
        }

        .panel {
          display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
          gap: 24px;
          background: var(--panel-2);
          border: 1px solid var(--line);
          border-radius: 20px;
          padding: clamp(18px, 2.5vw, 32px);
        }
        .panel-col { min-width: 0; display: flex; flex-direction: column; }
        .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
        .panel-head .label { font-family: var(--mono); font-size: 11.5px; font-weight: 700; letter-spacing: .08em; color: var(--text-dim); text-transform: uppercase; }
        .stage-tag {
          font-family: var(--mono); font-size: 11px; font-weight: 800; color: #04101c;
          padding: 5px 12px; border-radius: 8px; background: var(--step-color, #3b82f6);
          transition: background .3s ease;
        }
        pre.payload {
          margin: 0; padding: 20px; border-radius: 16px;
          background: ${isDark ? '#020617' : '#0f172a'};
          border: 1px solid var(--line);
          color: #6ee7b7; font-family: var(--mono); font-size: 12.5px; line-height: 1.7;
          max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-word;
          box-shadow: inset 0 2px 10px rgba(0,0,0,.4);
        }
        .kv { display: flex; flex-direction: column; gap: 2px; }
        .kv-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--line-soft); font-size: 12.5px; }
        .kv-row:last-child { border-bottom: none; }
        .kv-label { color: var(--text-dim); font-weight: 500; }
        .kv-value { font-family: var(--mono); font-weight: 700; color: var(--text); text-align: right; }

        .footer-row {
          grid-column: 1 / -1;
          display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;
          margin-top: 6px; padding-top: 16px; border-top: 1px solid var(--line);
          font-family: var(--mono); font-size: 12px; color: var(--text-dim);
        }
        .live { display: inline-flex; align-items: center; gap: 8px; color: #34d399; font-weight: 700; }
        .live .dot-wrap { position: relative; width: 8px; height: 8px; }
        .live .dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; }

        @media (max-width: 980px) {
          .steps { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 680px) {
          .steps { grid-template-columns: repeat(2, 1fr); }
          .panel { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="app">
        {/* Header */}
        <div className="header">
          <div>
            <div className="eyebrow">
              <span className="dot-wrap">
                <span className="dot anim-ping" style={{ position: 'absolute' }} />
                <span className="dot" style={{ position: 'relative' }} />
              </span>
              <span className="label">Live MCP Architecture Trace</span>
            </div>
            <h1>How MCP Manager Operates</h1>
          </div>

          <div className="controls">
            <button
              className="pause-btn"
              type="button"
              onClick={() => setIsPlaying((prev) => !prev)}
            >
              {isPlaying ? '⏸ Pause trace' : '▶ Resume trace'}
            </button>
            <span className="step-count">Step {active + 1} of {STEPS.length}</span>
          </div>
        </div>

        {/* Progress Track */}
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${((active + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Steps Grid */}
        <div className="steps" role="tablist" aria-label="MCP pipeline stages">
          {STEPS.map((s, i) => {
            const isActive = i === active;
            return (
              <button
                key={s.title}
                type="button"
                className="step"
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? 'step' : undefined}
                data-index={i}
                data-done={i < active}
                onClick={() => {
                  setActive(i);
                  setIsPlaying(false);
                }}
                style={{
                  '--step-color': s.color,
                  '--glow': `${s.color}59`,
                  '--ring': `${s.color}59`,
                } as React.CSSProperties}
              >
                <div className="step-top">
                  <span className="icon">{renderIconSvg(s.icon)}</span>
                  <span className="index">{String(i + 1).padStart(2, '0')}</span>
                </div>

                <div>
                  <h4 className="step-title">{s.title}</h4>
                  <p className="step-sub">{s.sub}</p>
                </div>

                <span className="badge">{s.badge}</span>
              </button>
            );
          })}
        </div>

        {/* Inspector Panel */}
        <div className="panel" style={{ '--step-color': activeStep.color } as React.CSSProperties}>
          <div className="panel-col">
            <div className="panel-head">
              <span className="label">Live Inspection Payload</span>
              <span className="stage-tag">Stage {String(active + 1).padStart(2, '0')}</span>
            </div>
            <pre className="payload fade-in" key={active}>
              {activeStep.payload}
            </pre>
          </div>

          <div className="panel-col">
            <span className="label" style={{ marginBottom: '14px' }}>Execution Properties</span>
            <div className="kv">
              {activeStep.props.map(([k, v]) => (
                <div key={k} className="kv-row">
                  <span className="kv-label">{k}</span>
                  <span className="kv-value">{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="footer-row">
            <span>Security: Keycloak JWT Guard</span>
            <span className="live">
              <span className="dot-wrap">
                <span className="dot anim-pulse" />
              </span>
              Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
