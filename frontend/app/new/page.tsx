'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchAuthConfig, redirectToLogin, getStoredToken, storePostLoginRedirect } from '@/lib/auth';
import { publicEnv } from '@/lib/env';

export default function NewLoginPage() {
  const router = useRouter();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [topbarVisible, setTopbarVisible] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    setHasToken(Boolean(getStoredToken()));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const handleLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (getStoredToken()) {
      router.push('/dashboard');
      return;
    }
    setLoggingIn(true);
    try {
      storePostLoginRedirect('/dashboard');
      const config = await fetchAuthConfig(publicEnv.NEXT_PUBLIC_BE_API_URL);
      if (!config.auth_enabled) {
        router.push('/dashboard');
        return;
      }
      await redirectToLogin(config, true);
    } catch (err) {
      console.error('Failed to trigger Keycloak login:', err);
      setLoggingIn(false);
      router.push('/login');
    }
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div data-theme={theme} className="h-screen w-screen max-h-screen overflow-hidden flex flex-col justify-between relative bg-[var(--bg)] text-[var(--text)] transition-colors duration-300 select-none">
      <style jsx global>{`
        :root {
          --radius: 16px;
        }
        [data-theme="dark"] {
          --bg: #060a10;
          --surface: rgba(13, 19, 28, 0.88);
          --surface-2: #121a24;
          --surface-3: #0a0f16;
          --border: rgba(127, 200, 255, 0.16);
          --text: #eaf2fa;
          --text-muted: #8ca0b3;
          --blue: #7fc8ff;
          --blue-soft: rgba(127, 200, 255, 0.1);
          --amber: #f5b54c;
          --red: #ff6b6b;
          --green: #6fd6a0;
          --purple: #a855f7;
          --btn-primary-text: #04121c;
          --noise-opacity: 0.03;
        }
        [data-theme="light"] {
          --bg: #f3f6fa;
          --surface: rgba(255, 255, 255, 0.92);
          --surface-2: #eef2f7;
          --surface-3: #e9eef4;
          --border: rgba(20, 40, 70, 0.12);
          --text: #0d1b2a;
          --text-muted: #5c6b7c;
          --blue: #1c73c9;
          --blue-soft: rgba(28, 115, 201, 0.08);
          --amber: #b8710f;
          --red: #d63a3a;
          --green: #227a52;
          --purple: #9333ea;
          --btn-primary-text: #ffffff;
          --noise-opacity: 0.015;
        }

        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; overflow: hidden; height: 100vh; }

        .noise {
          position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: var(--noise-opacity);
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }

        /* Topbar */
        .topbar {
          background: var(--surface-3); border-bottom: 1px solid var(--border);
          text-align: center; font-size: 12.5px; color: var(--text-muted);
          padding: 7px 16px; position: relative; z-index: 30; flex-shrink: 0;
        }
        .topbar b { color: var(--text); font-weight: 600; }
        .topbar-close {
          position: absolute; right: 16px; top: 50%; transform: translateY(-50%);
          background: none; border: none; color: var(--text-muted); cursor: pointer;
          font-size: 14px; line-height: 1; padding: 4px;
        }
        .topbar-close:hover { color: var(--text); }

        /* Header */
        .header-nav {
          z-index: 30; display: flex; align-items: center; justify-content: space-between;
          padding: 14px 32px; border-bottom: 1px solid var(--border);
          background: color-mix(in srgb, var(--bg) 80%, transparent);
          backdrop-filter: blur(12px); flex-shrink: 0;
        }
        .logo { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 16px; letter-spacing: -0.01em; }
        .logo-mark {
          width: 24px; height: 24px; border-radius: 7px;
          background: conic-gradient(from 200deg, var(--blue), var(--amber), var(--blue));
          display: grid; place-items: center; box-shadow: 0 0 16px rgba(127, 200, 255, 0.3); flex-shrink: 0;
        }
        .logo-mark::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--bg); }

        .btn-login-nav {
          font-weight: 700; font-size: 13px; padding: 9px 20px; border-radius: 10px;
          background: var(--blue); color: var(--btn-primary-text); border: none; cursor: pointer;
          display: inline-flex; align-items: center; gap: 8px;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .btn-login-nav:hover { box-shadow: 0 0 20px rgba(127, 200, 255, 0.45); transform: translateY(-1px); }

        .btn-dash-nav {
          font-weight: 600; font-size: 13px; padding: 8px 16px; border-radius: 10px;
          background: transparent; color: var(--text); border: 1px solid var(--border);
          text-decoration: none; transition: border-color 0.15s ease;
        }
        .btn-dash-nav:hover { border-color: var(--blue); color: var(--blue); }

        .theme-toggle {
          width: 34px; height: 34px; border-radius: 999px; display: grid; place-items: center; cursor: pointer;
          background: var(--surface-2); border: 1px solid var(--border); color: var(--text); transition: border-color .15s ease, transform .15s ease;
        }
        .theme-toggle:hover { border-color: var(--blue); transform: translateY(-1px); }
        .theme-toggle svg { width: 15px; height: 15px; }

        /* Top Header Title Stack (Positioned ABOVE Animation) */
        .title-header-stack {
          z-index: 25; text-align: center; padding: 18px 20px 0;
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          flex-shrink: 0;
        }

        .eyebrow {
          display: inline-flex; align-items: center; gap: 8px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; letter-spacing: 0.08em;
          color: var(--blue); background: var(--blue-soft); border: 1px solid var(--border); border-radius: 999px; padding: 4px 12px; text-transform: uppercase;
        }
        .eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--blue); box-shadow: 0 0 8px var(--blue); animation: pulse-dot 2s ease-in-out infinite; }
        @keyframes pulse-dot { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }

        .mcp-title {
          font-weight: 800; font-size: clamp(26px, 3.5vw, 38px); line-height: 1.1; letter-spacing: -0.02em; margin: 0;
        }
        .mcp-title span { color: var(--blue); }
        .mcp-subtitle { color: var(--text-muted); font-size: 13px; margin: 0; max-width: 480px; line-height: 1.4; }

        /* Center Stage (100% Unobscured Animation Canvas) */
        .center-stage {
          position: relative; flex: 1; display: flex; align-items: center; justify-content: center;
          overflow: hidden; width: 100%;
        }
        .hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 10; }
        [data-theme="dark"] .hero-bg { opacity: 0.95; }
        [data-theme="light"] .hero-bg { opacity: 0.75; }
        .hero-bg svg { width: 100%; height: 100%; display: block; }

        /* SVG Flow Colors & Particles */
        .flow-line-in { stroke: url(#gradIn); }
        .flow-line-out { stroke: url(#gradOut); }
        .flow-line-denied { stroke: #ff6b6b; stroke-dasharray: 5 6; }
        .flow-label { fill: var(--text-muted); font-weight: 500; }
        .flow-dot-blue { fill: #7fc8ff; filter: drop-shadow(0 0 6px #7fc8ff); }
        .flow-dot-green { fill: #6fd6a0; filter: drop-shadow(0 0 6px #6fd6a0); }
        .flow-dot-red { fill: #ff6b6b; filter: drop-shadow(0 0 6px #ff6b6b); }
        
        .node-ring { stroke: var(--amber); } 
        .node-fill { fill: var(--bg); stroke: var(--amber); }

        /* Footer Bar */
        .footer-bar {
          z-index: 30; border-top: 1px solid var(--border); padding: 12px 32px;
          display: flex; align-items: center; justify-between: space-between;
          font-size: 11.5px; color: var(--text-muted); font-family: ui-monospace, SFMono-Regular, monospace;
          background: color-mix(in srgb, var(--bg) 90%, transparent); flex-shrink: 0;
        }
      `}</style>

      <div className="noise" />

      {/* Top Bar */}
      {topbarVisible && (
        <div className="topbar">
          <b>New:</b> Keycloak OIDC single sign-on & FastMCP streamable transport enabled.
          <button onClick={() => setTopbarVisible(false)} className="topbar-close" aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* Header Nav */}
      <header className="header-nav">
        <div className="logo">
          <span className="logo-mark" /> MCP Manager
        </div>
        <div className="flex items-center gap-3">
          {hasToken ? (
            <Link href="/dashboard" className="btn-dash-nav">
              Dashboard →
            </Link>
          ) : (
            <button onClick={handleLogin} disabled={loggingIn} className="btn-login-nav">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              <span>{loggingIn ? 'Connecting...' : 'Log in'}</span>
            </button>
          )}

          <button onClick={toggleTheme} className="theme-toggle" aria-label="Toggle theme">
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Top Header Title Stack (Positioned ABOVE Animation Canvas) */}
      <div className="title-header-stack">
        <div className="eyebrow">
          <span className="eyebrow-dot" /> Keycloak OIDC Authentication
        </div>
        <h1 className="mcp-title">
          MCP <span>Manager</span>
        </h1>
        <p className="mcp-subtitle">
          Developer-first control plane for FastMCP servers and OpenAPI REST microservices.
        </p>
      </div>

      {/* Center Stage: 100% Completely Unobscured Animation Canvas */}
      <main className="center-stage">
        <div className="hero-bg">
          <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="glowCenter" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f5b54c" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#f5b54c" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="glowRed" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ff6b6b" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#ff6b6b" stopOpacity="0" />
              </radialGradient>
              <filter id="glowBlur" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="14" />
              </filter>

              {/* Gradient Line Paths */}
              <linearGradient id="gradIn" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#818cf8" stopOpacity="0.75" />
              </linearGradient>

              <linearGradient id="gradOut" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#818cf8" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0.75" />
              </linearGradient>
            </defs>

            {/* Left-to-Center Inbound Curve Paths */}
            <g strokeWidth="1.8" fill="none">
              <path d="M0,90 C260,90 420,360 800,450" className="flow-line-in" />
              <path d="M0,210 C300,210 460,370 800,450" className="flow-line-in" />
              <path d="M0,330 C320,330 500,390 800,450" className="flow-line-in" />
              <path d="M0,570 C320,570 500,510 800,450" className="flow-line-in" />
              <path d="M0,690 C300,690 460,530 800,450" className="flow-line-in" />
              <path d="M0,810 C260,810 420,540 800,450" className="flow-line-in" />
            </g>

            {/* Left Micro-Nodes & Endpoint Labels */}
            <g fontFamily="JetBrains Mono, monospace" fontSize="12" className="flow-label">
              <circle cx="8" cy="90" r="4" className="flow-dot-blue" /><text x="20" y="94">Payments API</text>
              <circle cx="8" cy="210" r="4" className="flow-dot-blue" /><text x="20" y="214">Inventory API</text>
              <circle cx="8" cy="330" r="4" className="flow-dot-blue" /><text x="20" y="334">CRM API</text>
              <circle cx="8" cy="570" r="4" className="flow-dot-blue" /><text x="20" y="574">HR API</text>
              <circle cx="8" cy="690" r="4" className="flow-dot-blue" /><text x="20" y="694">Analytics API</text>
              <circle cx="8" cy="810" r="4" className="flow-dot-blue" /><text x="20" y="814">Support API</text>
            </g>

            {/* Inbound Flowing Dots (Left -> Center) */}
            <g className="flow-anim">
              <g><animateMotion dur="4.2s" begin="0s" repeatCount="indefinite" path="M0,90 C260,90 420,360 800,450" /><circle r="5" className="flow-dot-blue" /></g>
              <g><animateMotion dur="3.6s" begin="0.4s" repeatCount="indefinite" path="M0,210 C300,210 460,370 800,450" /><circle r="5" className="flow-dot-blue" /></g>
              <g><animateMotion dur="4.6s" begin="0.8s" repeatCount="indefinite" path="M0,330 C320,330 500,390 800,450" /><circle r="5" className="flow-dot-blue" /></g>
              <g><animateMotion dur="3.9s" begin="0.2s" repeatCount="indefinite" path="M0,570 C320,570 500,510 800,450" /><circle r="5" className="flow-dot-blue" /></g>
              <g><animateMotion dur="4.4s" begin="0.6s" repeatCount="indefinite" path="M0,690 C300,690 460,530 800,450" /><circle r="5" className="flow-dot-blue" /></g>
              <g><animateMotion dur="3.7s" begin="1.0s" repeatCount="indefinite" path="M0,810 C260,810 420,540 800,450" /><circle r="5" className="flow-dot-blue" /></g>
            </g>

            {/* Central Gateway Core Node */}
            <g transform="translate(800,450)">
              <circle r="70" fill="url(#glowCenter)" filter="url(#glowBlur)" />
              <circle r="26" className="node-fill" strokeWidth="2.2" />
              <circle r="26" fill="none" className="node-ring" strokeWidth="1.8" opacity="0.85">
                <animate attributeName="r" values="26;42;26" dur="2.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.85;0;0.85" dur="2.8s" repeatCount="indefinite" />
              </circle>
              {/* Lock Icon inside Center Node */}
              <rect x="-7" y="-3" width="14" height="12" rx="2" fill="none" stroke="#f5b54c" strokeWidth="1.8" />
              <path d="M-5,-3 v-5 a5,5 0 0 1 10,0 v5" fill="none" stroke="#f5b54c" strokeWidth="1.8" />
              <text y="52" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="13" fontWeight="bold" fill="#f5b54c">MCP Manager</text>
              <text y="69" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="11" fill="var(--text-muted)">Keycloak JWT check</text>
            </g>

            {/* Center-to-Right Outbound Curve Paths (4 Right Strings) */}
            <g strokeWidth="1.8" fill="none">
              {/* Path 1: Top Right Authorized */}
              <path d="M800,450 C1040,450 1200,210 1600,180" className="flow-line-out" />
              {/* Path 2: Upper Center Right Authorized */}
              <path d="M800,450 C1040,450 1240,320 1600,310" className="flow-line-out" />
              {/* Path 3: Lower Center Right Authorized */}
              <path d="M800,450 C1040,450 1260,490 1600,480" className="flow-line-out" />
              {/* Path 4: Bottom Right Denied (Red Dashed) */}
              <path d="M800,450 C1040,450 1200,670 1480,710" className="flow-line-denied" opacity="0.65" />
            </g>

            {/* Blocked Denied Cross Node on Path 4 */}
            <g transform="translate(1120,575)" opacity="0.9">
              <circle r="14" fill="url(#glowRed)" filter="url(#glowBlur)" />
              <circle r="10" className="node-fill" stroke="#ff6b6b" strokeWidth="1.6" />
              <path d="M-4,-4 L4,4 M4,-4 L-4,4" stroke="#ff6b6b" strokeWidth="1.8" />
            </g>

            {/* Right Micro-Nodes & Endpoint Labels (All 4 Strings) */}
            <g fontFamily="JetBrains Mono, monospace" fontSize="12" className="flow-label">
              <circle cx="1592" cy="180" r="4" className="flow-dot-green" /><text x="1580" y="166" textAnchor="end">MCP Client · authorized</text>
              <circle cx="1592" cy="310" r="4" className="flow-dot-green" /><text x="1580" y="296" textAnchor="end">FastMCP SSE · active</text>
              <circle cx="1592" cy="480" r="4" className="flow-dot-green" /><text x="1580" y="466" textAnchor="end">Keycloak OIDC · verified</text>
              <circle cx="1480" cy="710" r="4" className="flow-dot-red" opacity="0.8" /><text x="1465" y="696" textAnchor="end" fill="#ff6b6b" opacity="0.8">unauthorized · denied</text>
            </g>

            {/* Outbound Flowing Dots (Center -> Right) Across All 4 Strings */}
            <g className="flow-anim">
              {/* Path 1: Top Right Authorized */}
              <g><animateMotion dur="3.4s" begin="0.2s" repeatCount="indefinite" path="M800,450 C1040,450 1200,210 1600,180" /><circle r="5" className="flow-dot-green" /></g>
              <g><animateMotion dur="3.4s" begin="1.9s" repeatCount="indefinite" path="M800,450 C1040,450 1200,210 1600,180" /><circle r="5" className="flow-dot-green" /></g>

              {/* Path 2: Upper Center Right Authorized */}
              <g><animateMotion dur="3.1s" begin="0.5s" repeatCount="indefinite" path="M800,450 C1040,450 1240,320 1600,310" /><circle r="5" className="flow-dot-green" /></g>
              <g><animateMotion dur="3.1s" begin="2.1s" repeatCount="indefinite" path="M800,450 C1040,450 1240,320 1600,310" /><circle r="5" className="flow-dot-green" /></g>

              {/* Path 3: Lower Center Right Authorized */}
              <g><animateMotion dur="3.6s" begin="0.7s" repeatCount="indefinite" path="M800,450 C1040,450 1260,490 1600,480" /><circle r="5" className="flow-dot-green" /></g>
              <g><animateMotion dur="3.6s" begin="2.5s" repeatCount="indefinite" path="M800,450 C1040,450 1260,490 1600,480" /><circle r="5" className="flow-dot-green" /></g>

              {/* Path 4: Bottom Right Denied (Red Particle pulse up to blocked node) */}
              <g><animateMotion dur="2.4s" begin="0.4s" repeatCount="indefinite" path="M800,450 C1040,450 1120,575 1120,575" /><circle r="5" className="flow-dot-red" /></g>
            </g>
          </svg>
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="footer-bar">
        <span>MCP SERVER MANAGER</span>
        <span>FASTmcp v3.4.4 • SINGLE VIEWPORT</span>
      </footer>
    </div>
  );
}
