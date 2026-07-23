'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import './landing.css';
import { fetchAuthConfig, redirectToLogin, getStoredToken, storePostLoginRedirect } from '@/lib/auth';
import { publicEnv } from '@/lib/env';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/context/ThemeContext';
import InteractiveFlowDiagram from '@/components/InteractiveFlowDiagram';

export default function LandingPage() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [hasToken, setHasToken] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setHasToken(Boolean(getStoredToken()));
  }, []);

  const handleLogin = async () => {
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

  const toolPills = [
    { name: 'search_users()', color: '#3b82f6' },
    { name: 'create_ticket()', color: '#06b6d4' },
    { name: 'jwt_verify()', color: '#8b5cf6' },
    { name: 'fetch_metrics()', color: '#10b981' },
    { name: 'payments_charge()', color: '#ec4899' },
    { name: 'git_commit_push()', color: '#f59e0b' },
    { name: 'audit_log_trace()', color: '#3b82f6' },
  ];

  return (
    <div className={`landing-root ${isDark ? 'dark bg-[#020617] text-white' : 'bg-slate-50 text-slate-900'} min-h-screen font-sans transition-colors duration-300 selection:bg-blue-500 selection:text-white`}>
      {/* 1. Navbar */}
      <nav id="navbar" className="navbar">
        <div className="nav-container">
          <Link href="/" className="nav-logo">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white text-sm shadow-md shadow-blue-500/20">
              M
            </div>
            <span className="logo-text">MCP Manager</span>
          </Link>

          <ul className={`nav-links ${mobileMenuOpen ? 'open' : ''}`} id="nav-links">
            <li><a href="#workflow" className="nav-link" onClick={() => setMobileMenuOpen(false)}>Workflow</a></li>
            <li><a href="#trace" className="nav-link" onClick={() => setMobileMenuOpen(false)}>Live Trace</a></li>
            <li><a href="#architecture" className="nav-link" onClick={() => setMobileMenuOpen(false)}>Architecture</a></li>
            <li><a href="#security" className="nav-link" onClick={() => setMobileMenuOpen(false)}>Security</a></li>
          </ul>

          <div className="flex items-center gap-3">
            <ThemeToggle />

            {hasToken ? (
              <Link href="/dashboard" className="cta-primary !py-2 !px-5 !text-sm">
                Go to Dashboard →
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleLogin}
                disabled={loggingIn}
                className="cta-primary !py-2 !px-5 !text-sm cursor-pointer"
              >
                {loggingIn ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Connecting...
                  </span>
                ) : (
                  'Login with Keycloak'
                )}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* 2. Hero Section */}
      <header className="hero" id="hero">
        <div className="hero-glow-bg" />

        <div className="hero-container">
          <div className="hero-badge">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span>Enterprise API Gateway for Model Context Protocol</span>
          </div>

          <h1 className="hero-title">
            Expose Any API as <br />
            <span className="text-gradient">Secure MCP Tools</span>
          </h1>

          <p className="hero-subtitle">
            Convert OpenAPI specs into unified MCP endpoints guarded by Keycloak JWT authentication. Provide AI Agents controlled, audit-logged access to enterprise REST services.
          </p>

          <div className="hero-actions">
            {hasToken ? (
              <Link href="/dashboard" className="cta-primary">
                Open Dashboard →
              </Link>
            ) : (
              <button type="button" onClick={handleLogin} disabled={loggingIn} className="cta-primary cursor-pointer">
                {loggingIn ? 'Connecting Keycloak...' : 'Sign In with Keycloak →'}
              </button>
            )}
            <a href="#trace" className="cta-secondary">
              Explore Live Architecture ↓
            </a>
          </div>
        </div>

        {/* Live Tool Pill Marquee */}
        <div className="marquee-container">
          <div className="marquee-track">
            {[...toolPills, ...toolPills].map((pill, idx) => (
              <div key={idx} className="pill-item">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: pill.color }}></span>
                <span>{pill.name}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* 3. Interactive Architecture Trace Section */}
      <section className="section" id="trace">
        <div className="section-container">
          <InteractiveFlowDiagram />
        </div>
      </section>

      {/* 4. Automated Workflow Pipeline */}
      <section className="section" id="workflow">
        <div className="section-container">
          <div className="section-header">
            <span className="section-tag">AUTOMATED WORKFLOW</span>
            <h2 className="section-title">From OpenAPI Spec to MCP Tool in Seconds</h2>
            <p className="section-desc">
              Zero manual code required. Register your REST endpoints and let MCP Manager synthesize authenticated tools for AI models.
            </p>
          </div>

          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-icon-wrap">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="feature-title">01. Register OpenAPI Specs</h3>
              <p className="feature-desc">Upload or link your Swagger / OpenAPI 3.0+ JSON specifications cleanly into the control plane.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrap">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="feature-title">02. Synthesize MCP Tools</h3>
              <p className="feature-desc">Automatic route mapping transforms paths, request schemas, and query parameters into JSON-RPC tools.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrap">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="feature-title">03. Keycloak JWT Security</h3>
              <p className="feature-desc">Enforce OAuth2 Bearer token validation, JWKS signature verification, and RBAC role checks per execution.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrap">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="feature-title">04. Unified Server Endpoint</h3>
              <p className="feature-desc">Expose all microservices through a single, consolidated MCP gateway endpoint: <code>/mcp/</code>.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrap">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h3 className="feature-title">05. Audit Trail & Logs</h3>
              <p className="feature-desc">Monitor real-time invocation logs, parameter payloads, HTTP status codes, and execution latencies.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrap">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="feature-title">06. Connect AI Clients</h3>
              <p className="feature-desc">Connect Claude Desktop, Cursor IDE, VS Code, or custom AI agents directly via streamable transport.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. System Architecture Section */}
      <section className="section" id="architecture">
        <div className="section-container">
          <div className="section-header">
            <span className="section-tag">CONTROL PLANE ARCHITECTURE</span>
            <h2 className="section-title">Centralized Enterprise Gateway</h2>
            <p className="section-desc">
              Bridge legacy REST services and native MCP servers into a single managed control plane.
            </p>
          </div>

          <div className="arch-box">
            <div className="arch-column">
              <div className="arch-col-title">Upstream APIs</div>
              <div className="arch-card">
                <div>
                  <div className="font-bold text-sm">Payment API</div>
                  <div className="text-xs text-slate-500 font-mono">/api/v1/payments</div>
                </div>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-500">REST</span>
              </div>
              <div className="arch-card">
                <div>
                  <div className="font-bold text-sm">User Service</div>
                  <div className="text-xs text-slate-500 font-mono">/api/v1/users</div>
                </div>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-500">OpenAPI</span>
              </div>
            </div>

            <div className="arch-column">
              <div className="arch-col-title">MCP Gateway</div>
              <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white text-center shadow-xl">
                <div className="font-extrabold text-lg mb-1">MCP Manager</div>
                <div className="text-xs opacity-80 mb-3 font-mono">Keycloak Guard & Gateway</div>
                <span className="inline-block px-3 py-1 rounded-full bg-white/20 text-xs font-mono font-bold">
                  POST /mcp/
                </span>
              </div>
            </div>

            <div className="arch-column">
              <div className="arch-col-title">AI Consumer Clients</div>
              <div className="arch-card">
                <div>
                  <div className="font-bold text-sm">Claude Desktop</div>
                  <div className="text-xs text-slate-500">Anthropic Client</div>
                </div>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500">SSE</span>
              </div>
              <div className="arch-card">
                <div>
                  <div className="font-bold text-sm">Cursor IDE</div>
                  <div className="text-xs text-slate-500">AI Code Editor</div>
                </div>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500">JSON-RPC</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Footer */}
      <footer className="footer">
        <div className="footer-container">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
              M
            </div>
            <span className="font-bold text-sm">MCP Server Manager</span>
          </div>

          <div className="text-xs text-slate-500 font-mono">
            Keycloak JWT Guard Active ● Enterprise Edition 2026
          </div>
        </div>
      </footer>
    </div>
  );
}
