'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchAuthConfig, redirectToLogin, getStoredToken, storePostLoginRedirect } from '@/lib/auth';
import { publicEnv } from '@/lib/env';

export default function NewLandingPage() {
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

  useEffect(() => {
    const rows = document.querySelectorAll('.feature-row');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    rows.forEach((r) => io.observe(r));
    return () => io.disconnect();
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div data-theme={theme} className="min-h-screen">
      <style jsx global>{`
        :root { --radius: 14px; --maxw: 1160px; }

        [data-theme="dark"] {
          --bg: #060a10; --surface: #0d131c; --surface-2: #121a24; --surface-3: #0a0f16;
          --border: rgba(127, 200, 255, 0.14);
          --text: #eaf2fa; --text-muted: #8ca0b3;
          --blue: #7fc8ff; --blue-soft: rgba(127, 200, 255, .09);
          --amber: #f5b54c; --red: #ff6b6b; --green: #6fd6a0;
          --btn-primary-text: #04121c;
          --noise-opacity: .03; --card-shadow: none;
        }
        [data-theme="light"] {
          --bg: #f3f6fa; --surface: #ffffff; --surface-2: #eef2f7; --surface-3: #e9eef4;
          --border: rgba(20, 40, 70, 0.10);
          --text: #0d1b2a; --text-muted: #5c6b7c;
          --blue: #1c73c9; --blue-soft: rgba(28, 115, 201, .07);
          --amber: #b8710f; --red: #d63a3a; --green: #227a52;
          --btn-primary-text: #ffffff;
          --noise-opacity: .015; --card-shadow: 0 1px 2px rgba(20, 40, 70, .04), 0 8px 24px rgba(20, 40, 70, .05);
        }

        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body {
          background: var(--bg);
          color: var(--text);
          font-family: 'Inter', system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
          transition: background .35s ease, color .35s ease;
          margin: 0;
          padding: 0;
        }
        ::selection { background: var(--blue); color: #04121c; }
        :focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; border-radius: 4px; }
        a { color: inherit; }

        .noise {
          position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: var(--noise-opacity);
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }

        .wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 32px; }

        /* ---------- topbar ---------- */
        .topbar {
          background: var(--surface-3); border-bottom: 1px solid var(--border);
          text-align: center; font-size: 13px; color: var(--text-muted);
          padding: 9px 16px; position: relative; z-index: 5;
        }
        .topbar b { color: var(--text); font-weight: 600; }
        .topbar-close {
          position: absolute; right: 16px; top: 50%; transform: translateY(-50%);
          background: none; border: none; color: var(--text-muted); cursor: pointer;
          font-size: 15px; line-height: 1; padding: 4px;
        }
        .topbar-close:hover { color: var(--text); }
        .topbar.hidden { display: none; }

        /* ---------- header ---------- */
        .header-nav {
          position: sticky; top: 0; z-index: 20;
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 32px; border-bottom: 1px solid var(--border);
          background: color-mix(in srgb, var(--bg) 78%, transparent);
          backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        }
        .logo { display: flex; align-items: center; gap: 10px; font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 17px; }
        .logo-mark {
          width: 24px; height: 24px; border-radius: 7px;
          background: conic-gradient(from 200deg, var(--blue), var(--amber), var(--blue));
          display: grid; place-items: center; box-shadow: 0 0 16px rgba(127, 200, 255, .3); flex-shrink: 0;
        }
        .logo-mark::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--bg); }

        .nav-right { display: flex; align-items: center; gap: 8px; }
        nav.links { display: flex; align-items: center; }
        nav.links a { color: var(--text-muted); text-decoration: none; font-size: 14px; padding: 8px 14px; border-radius: 8px; transition: color .15s ease, background .15s ease; }
        nav.links a:hover { color: var(--text); background: var(--surface-2); }
        .btn-nav {
          font-size: 13.5px; font-weight: 600; padding: 8px 16px; border-radius: 8px;
          border: 1px solid var(--border); text-decoration: none; margin-left: 6px;
          transition: border-color .15s ease, color .15s ease; cursor: pointer;
        }
        .btn-nav:hover { border-color: var(--blue); color: var(--blue); }

        .theme-toggle {
          width: 36px; height: 36px; border-radius: 999px; margin-left: 8px; display: grid; place-items: center; cursor: pointer;
          background: var(--surface-2); border: 1px solid var(--border); color: var(--text); transition: border-color .15s ease, transform .15s ease;
        }
        .theme-toggle:hover { border-color: var(--blue); transform: translateY(-1px); }
        .theme-toggle svg { width: 16px; height: 16px; }

        /* ---------- hero ---------- */
        .hero { position: relative; min-height: 82vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 70px 24px 30px; overflow: hidden; }
        .hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; }
        [data-theme="dark"] .hero-bg { opacity: .85; }
        [data-theme="light"] .hero-bg { opacity: .7; }
        .hero-bg svg { width: 100%; height: 100%; display: block; }

        .flow-line { stroke: var(--blue); } .flow-line-out { stroke: var(--blue); } .flow-line-denied { stroke: var(--red); }
        .flow-label { fill: var(--text-muted); } .flow-dot { fill: var(--blue); }
        .node-ring { stroke: var(--amber); } .node-fill { fill: var(--surface); stroke: var(--amber); }
        .node-lock { stroke: var(--amber); } .node-label { fill: var(--amber); } .node-sublabel { fill: var(--text-muted); }
        .stop-blue-0 { stop-color: var(--blue); }

        .hero-content { position: relative; z-index: 2; max-width: 740px; animation: rise .9s cubic-bezier(.2,.8,.2,1) both; }
        @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }

        .eyebrow {
          display: inline-flex; align-items: center; gap: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; letter-spacing: .06em;
          color: var(--blue); background: var(--blue-soft); border: 1px solid var(--border); border-radius: 999px; padding: 6px 14px; margin-bottom: 24px;
        }
        .eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--blue); box-shadow: 0 0 8px var(--blue); animation: pulse-dot 2.2s ease-in-out infinite; }
        @keyframes pulse-dot { 0%,100% { opacity: 1 } 50% { opacity: .35 } }

        h1 { font-family: ui-sans-serif, system-ui, sans-serif; font-weight: 600; font-size: clamp(32px, 4.6vw, 54px); line-height: 1.08; letter-spacing: -.01em; margin: 0 0 20px; }
        h1 span { color: var(--blue); }
        .lede { color: var(--text-muted); font-size: 16.5px; line-height: 1.65; max-width: 540px; margin: 0 auto 32px; }

        .cta-row { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-bottom: 34px; }
        .btn {
          font-family: 'Inter', sans-serif; font-weight: 600; font-size: 14.5px; padding: 13px 26px; border-radius: 10px; text-decoration: none;
          display: inline-flex; align-items: center; gap: 8px; transition: transform .15s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease; border: 1px solid transparent; cursor: pointer;
        }
        .btn:active { transform: translateY(1px); }
        .btn-primary { background: var(--blue); color: var(--btn-primary-text); }
        .btn-primary:hover { box-shadow: 0 0 28px rgba(127, 200, 255, .4); }
        .btn-primary:hover svg { transform: translateX(2px); }
        .btn-primary svg { transition: transform .15s ease; }
        .btn-secondary { background: transparent; color: var(--text); border-color: var(--border); }
        .btn-secondary:hover { border-color: var(--blue); color: var(--blue); }
        .btn svg { width: 15px; height: 15px; }

        /* stage pills */
        .stage-row { display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-muted); }
        .stage-pill { padding: 6px 13px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); }
        .stage-arrow { opacity: .5; }

        /* ---------- marquee ---------- */
        .marquee-section { position: relative; z-index: 2; padding: 34px 0 44px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); background: var(--surface-3); }
        .marquee-label { text-align: center; font-size: 12.5px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; margin-bottom: 20px; }
        .marquee-track { display: flex; width: max-content; gap: 14px; animation: scroll-x 26s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .marquee-track { animation: none; } }
        .marquee-section:hover .marquee-track { animation-play-state: paused; }
        @keyframes scroll-x { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .chip {
          display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; font-size: 13.5px; color: var(--text-muted);
          background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 9px 16px;
        }
        .chip i { width: 6px; height: 6px; border-radius: 50%; background: var(--blue); box-shadow: 0 0 6px var(--blue); }

        /* ---------- feature rows ---------- */
        .features { position: relative; z-index: 2; }
        .feature-row {
          display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; max-width: var(--maxw); margin: 0 auto; padding: 96px 32px;
          opacity: 0; transform: translateY(20px); transition: opacity .7s cubic-bezier(.2,.8,.2,1), transform .7s cubic-bezier(.2,.8,.2,1);
        }
        .feature-row.in-view { opacity: 1; transform: translateY(0); }
        .feature-row.reverse .f-text { order: 2; } .feature-row.reverse .f-panel { order: 1; }
        .f-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 12px; letter-spacing: .08em; color: var(--blue); margin-bottom: 14px; text-transform: uppercase; }
        .feature-row h3 { font-family: 'Space Grotesk', sans-serif; font-size: 26px; font-weight: 600; margin: 0 0 14px; letter-spacing: -.01em; }
        .feature-row p { color: var(--text-muted); font-size: 15px; line-height: 1.7; margin: 0 0 20px; max-width: 420px; }
        .f-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
        .f-list li { font-size: 14px; color: var(--text-muted); font-style: italic; display: flex; gap: 10px; }
        .f-list li::before { content: "›"; color: var(--blue); font-style: normal; font-weight: 700; }

        .f-panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px; box-shadow: var(--card-shadow); }
        .panel-dots { display: flex; gap: 6px; margin-bottom: 16px; }
        .panel-dots span { width: 8px; height: 8px; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--border); }

        .row-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-radius: 9px; background: var(--surface-2); border: 1px solid var(--border); font-family: 'JetBrains Mono', monospace; font-size: 12.5px; margin-bottom: 8px; }
        .row-item:last-child { margin-bottom: 0; }
        .status-ok { color: var(--green); font-size: 11.5px; font-weight: 600; }
        .status-denied { color: var(--red); font-size: 11.5px; font-weight: 600; text-decoration: line-through; opacity: .8; }
        .arrow-sep { color: var(--text-muted); font-size: 13px; }
        .mono-code { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; color: var(--text-muted); background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px; padding: 14px; line-height: 1.8; white-space: pre-wrap; word-break: break-word; }
        .mono-code .k { color: var(--blue); } .mono-code .v { color: var(--amber); }

        @media (max-width: 860px) {
          .feature-row { grid-template-columns: 1fr; gap: 32px; padding: 56px 24px; }
          .feature-row.reverse .f-text { order: 1; } .feature-row.reverse .f-panel { order: 2; }
        }

        /* ---------- stats ---------- */
        .stats { position: relative; z-index: 2; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); background: var(--surface-3); }
        .stats-grid { max-width: var(--maxw); margin: 0 auto; padding: 60px 32px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; text-align: center; }
        .stat-num { font-family: 'Space Grotesk', sans-serif; font-size: clamp(30px, 4vw, 44px); font-weight: 600; color: var(--blue); }
        .stat-label { color: var(--text-muted); font-size: 13.5px; margin-top: 6px; }
        @media (max-width: 700px) { .stats-grid { grid-template-columns: 1fr; gap: 36px; } }

        /* ---------- CTA band ---------- */
        .cta-band { position: relative; z-index: 2; text-align: center; padding: 100px 24px; }
        .cta-band h2 { font-family: 'Space Grotesk', sans-serif; font-size: clamp(26px, 3.4vw, 38px); font-weight: 600; margin: 0 0 16px; }
        .cta-band p { color: var(--text-muted); font-size: 15.5px; margin: 0 0 30px; }

        /* ---------- footer ---------- */
        footer { border-top: 1px solid var(--border); position: relative; z-index: 2; }
        .footer-top { max-width: var(--maxw); margin: 0 auto; padding: 48px 32px; display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 32px; }
        .footer-brand p { color: var(--text-muted); font-size: 13.5px; max-width: 280px; line-height: 1.6; }
        .footer-col h4 { font-size: 12.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); margin: 0 0 14px; font-weight: 600; }
        .footer-col a { display: block; color: var(--text-muted); text-decoration: none; font-size: 14px; margin-bottom: 10px; }
        .footer-col a:hover { color: var(--blue); }
        .footer-bottom { border-top: 1px solid var(--border); padding: 20px 32px; display: flex; justify-content: space-between; color: var(--text-muted); font-size: 13px; max-width: var(--maxw); margin: 0 auto; }
        @media (max-width: 700px) { .footer-top { grid-template-columns: 1fr; gap: 28px; } .footer-bottom { flex-direction: column; gap: 8px; text-align: center; } }
      `}</style>

      <div className="noise" />

      {topbarVisible && (
        <div className="topbar">
          <div className="wrap">
            <b>New:</b> per-tool scopes are now enforced directly from Keycloak roles.
            <button
              onClick={() => setTopbarVisible(false)}
              className="topbar-close"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <header className="header-nav">
        <div className="logo">
          <span className="logo-mark" /> MCP Manager
        </div>
        <div className="nav-right">
          <nav className="links">
            <a href="#how-it-works">Docs</a>
            <a href="#stats">Status</a>
          </nav>

          {hasToken ? (
            <Link href="/dashboard" className="btn-nav">
              Dashboard →
            </Link>
          ) : (
            <button onClick={handleLogin} disabled={loggingIn} className="btn-nav">
              {loggingIn ? 'Connecting...' : 'Log in'}
            </button>
          )}

          <button
            onClick={toggleTheme}
            className="theme-toggle"
            aria-label="Toggle light and dark theme"
          >
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

      <section className="hero">
        <div className="hero-bg">
          <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="glowAmber" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f5b54c" />
                <stop offset="100%" stopColor="#f5b54c" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="glowRed" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ff6b6b" />
                <stop offset="100%" stopColor="#ff6b6b" stopOpacity="0" />
              </radialGradient>
              <filter id="soft" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="10" />
              </filter>
              <linearGradient id="fadeIn" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" className="stop-blue-0" stopOpacity="0" />
                <stop offset="100%" className="stop-blue-0" stopOpacity=".55" />
              </linearGradient>
            </defs>
            <g strokeWidth="1.4" fill="none" opacity=".6">
              <path d="M0,90  C260,90  420,360 740,430" stroke="url(#fadeIn)" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
                <animate attributeName="stroke-dashoffset" from="1" to="0" dur="1.6s" begin="0.1s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1" />
              </path>
              <path d="M0,210 C300,210 460,370 740,430" stroke="url(#fadeIn)" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
                <animate attributeName="stroke-dashoffset" from="1" to="0" dur="1.6s" begin="0.25s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1" />
              </path>
              <path d="M0,330 C320,330 500,390 740,430" stroke="url(#fadeIn)" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
                <animate attributeName="stroke-dashoffset" from="1" to="0" dur="1.6s" begin="0.4s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1" />
              </path>
              <path d="M0,530 C320,530 500,470 740,430" stroke="url(#fadeIn)" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
                <animate attributeName="stroke-dashoffset" from="1" to="0" dur="1.6s" begin="0.4s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1" />
              </path>
              <path d="M0,650 C300,650 460,490 740,430" stroke="url(#fadeIn)" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
                <animate attributeName="stroke-dashoffset" from="1" to="0" dur="1.6s" begin="0.25s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1" />
              </path>
              <path d="M0,780 C260,780 420,500 740,430" stroke="url(#fadeIn)" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
                <animate attributeName="stroke-dashoffset" from="1" to="0" dur="1.6s" begin="0.1s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1" />
              </path>
            </g>
            <g fontFamily="JetBrains Mono, monospace" fontSize="13" className="flow-label">
              <circle cx="6" cy="90" r="3.5" className="flow-dot" /><text x="16" y="94">Payments API</text>
              <circle cx="6" cy="210" r="3.5" className="flow-dot" /><text x="16" y="214">Inventory API</text>
              <circle cx="6" cy="330" r="3.5" className="flow-dot" /><text x="16" y="334">CRM API</text>
              <circle cx="6" cy="530" r="3.5" className="flow-dot" /><text x="16" y="534">HR API</text>
              <circle cx="6" cy="650" r="3.5" className="flow-dot" /><text x="16" y="654">Analytics API</text>
              <circle cx="6" cy="780" r="3.5" className="flow-dot" /><text x="16" y="784">Support API</text>
            </g>
            <g className="flow-anim">
              <g><animateMotion dur="4.2s" begin="1.7s" repeatCount="indefinite" path="M0,90  C260,90  420,360 740,430" /><circle r="4" className="flow-dot" /></g>
              <g><animateMotion dur="3.6s" begin="2.1s" repeatCount="indefinite" path="M0,210 C300,210 460,370 740,430" /><circle r="4" className="flow-dot" /></g>
              <g><animateMotion dur="4.6s" begin="1.9s" repeatCount="indefinite" path="M0,330 C320,330 500,390 740,430" /><circle r="4" className="flow-dot" /></g>
              <g><animateMotion dur="3.9s" begin="2.3s" repeatCount="indefinite" path="M0,530 C320,530 500,470 740,430" /><circle r="4" className="flow-dot" /></g>
              <g><animateMotion dur="4.4s" begin="1.6s" repeatCount="indefinite" path="M0,650 C300,650 460,490 740,430" /><circle r="4" className="flow-dot" /></g>
              <g><animateMotion dur="3.7s" begin="2.0s" repeatCount="indefinite" path="M0,780 C260,780 420,500 740,430" /><circle r="4" className="flow-dot" /></g>
            </g>
            <g transform="translate(740,430)">
              <circle r="46" fill="url(#glowAmber)" opacity=".5" filter="url(#soft)" />
              <circle r="19" className="node-fill" strokeWidth="1.6" />
              <circle r="19" fill="none" className="node-ring" strokeWidth="1.2" opacity=".7">
                <animate attributeName="r" values="19;30;19" dur="2.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" values=".7;0;.7" dur="2.6s" repeatCount="indefinite" />
              </circle>
              <rect x="-6" y="-2" width="12" height="10" rx="2" fill="none" className="node-lock" strokeWidth="1.6" />
              <path d="M-4,-2 v-4 a4,4 0 0 1 8,0 v4" fill="none" className="node-lock" strokeWidth="1.6" />
              <text y="46" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="13" className="node-label">MCP Manager</text>
              <text y="63" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="11" className="node-sublabel">Keycloak JWT check</text>
            </g>
            <g strokeWidth="1.6" fill="none">
              <path d="M740,430 C980,430 1100,220 1560,190" className="flow-line-out" opacity=".65" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
                <animate attributeName="stroke-dashoffset" from="1" to="0" dur="1.4s" begin="1.5s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1" />
              </path>
              <path d="M740,430 C980,430 1200,430 1560,430" className="flow-line-out" opacity=".65" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
                <animate attributeName="stroke-dashoffset" from="1" to="0" dur="1.4s" begin="1.6s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1" />
              </path>
              <path d="M740,430 C980,430 1100,650 1420,690" className="flow-line-denied" opacity=".5" strokeDasharray="5 6" pathLength="1" strokeDashoffset="1">
                <animate attributeName="stroke-dashoffset" from="1" to="0" dur="1.4s" begin="1.7s" fill="freeze" />
              </path>
            </g>
            <g className="flow-anim">
              <g><animateMotion dur="3.2s" begin="3s" repeatCount="indefinite" path="M740,430 C980,430 1100,220 1560,190" /><circle r="4" className="flow-dot" /></g>
              <g><animateMotion dur="2.8s" begin="3.3s" repeatCount="indefinite" path="M740,430 C980,430 1200,430 1560,430" /><circle r="4" className="flow-dot" /></g>
            </g>
            <g transform="translate(1050,560)" opacity=".85">
              <circle r="11" fill="url(#glowRed)" filter="url(#soft)" />
              <circle r="9" className="node-fill" stroke="#ff6b6b" strokeWidth="1.4" />
              <path d="M-3,-3 L3,3 M3,-3 L-3,3" stroke="#ff6b6b" strokeWidth="1.4" />
            </g>
            <g fontFamily="JetBrains Mono, monospace" fontSize="13" className="flow-label">
              <circle cx="1560" cy="190" r="3.5" className="flow-dot" /><text x="1480" y="176" textAnchor="end">MCP Client · authorized</text>
              <circle cx="1560" cy="430" r="3.5" className="flow-dot" /><text x="1480" y="416" textAnchor="end">MCP Client · authorized</text>
              <circle cx="1420" cy="690" r="3.5" fill="#ff6b6b" opacity=".6" /><text x="1340" y="676" textAnchor="end" opacity=".6">unauthorized · denied</text>
            </g>
          </svg>
        </div>

        <div className="hero-content">
          <div className="eyebrow"><span className="eyebrow-dot" /> OPENAPI → MCP, SECURED BY KEYCLOAK</div>
          <h1>Every API you own becomes an <span>MCP tool</span>.<br />One endpoint serves them all, safely.</h1>
          <p className="lede">Register an OpenAPI spec and MCP Manager turns it into ready-to-use MCP tools. Every call is checked against a Keycloak JWT, so each client only ever sees and runs the tools it's actually authorized for.</p>
          <div className="cta-row">
            <button onClick={handleLogin} disabled={loggingIn} className="btn btn-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>
              {loggingIn ? 'Connecting...' : 'Log in'}
            </button>
            <a className="btn btn-secondary" href="#how-it-works">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
              Read the docs
            </a>
          </div>
          <div className="stage-row">
            <span className="stage-pill">Register</span><span className="stage-arrow">→</span>
            <span className="stage-pill">Convert</span><span className="stage-arrow">→</span>
            <span className="stage-pill">Authorize</span><span className="stage-arrow">→</span>
            <span className="stage-pill">Serve</span>
          </div>
        </div>
      </section>

      <section className="marquee-section">
        <div className="marquee-label">Every team's APIs, behind one gateway</div>
        <div className="marquee-track">
          <span className="chip"><i />Payments API</span><span className="chip"><i />Inventory API</span><span className="chip"><i />CRM API</span>
          <span className="chip"><i />HR API</span><span className="chip"><i />Analytics API</span><span className="chip"><i />Support API</span>
          <span className="chip"><i />Billing API</span><span className="chip"><i />Notifications API</span>
          <span className="chip"><i />Payments API</span><span className="chip"><i />Inventory API</span><span className="chip"><i />CRM API</span>
          <span className="chip"><i />HR API</span><span className="chip"><i />Analytics API</span><span className="chip"><i />Support API</span>
          <span className="chip"><i />Billing API</span><span className="chip"><i />Notifications API</span>
        </div>
      </section>

      <section className="features" id="how-it-works">
        <div className="feature-row">
          <div className="f-text">
            <div className="f-eyebrow">01 · Register</div>
            <h3>Bring the OpenAPI spec you already have</h3>
            <p>App owners register any OpenAPI-compatible service by pointing MCP Manager at its spec. No rewrites, no new SDKs to install.</p>
            <ul className="f-list">
              <li>Works with specs you already publish</li>
              <li>Versioned registrations per application</li>
              <li>Validates the spec before it goes live</li>
            </ul>
          </div>
          <div className="f-panel">
            <div className="panel-dots"><span /><span /><span /></div>
            <div className="row-item"><span>orders-api.yaml</span><span className="status-ok">● registered</span></div>
            <div className="row-item"><span>payments-api.yaml</span><span className="status-ok">● registered</span></div>
            <div className="row-item"><span>inventory-api.yaml</span><span className="status-ok">● registered</span></div>
          </div>
        </div>

        <div className="feature-row reverse">
          <div className="f-text">
            <div className="f-eyebrow">02 · Convert</div>
            <h3>Every operation becomes an MCP tool</h3>
            <p>Each endpoint in the spec is turned into a callable MCP tool automatically, keeping the same inputs, outputs, and behavior your API already defines.</p>
            <ul className="f-list">
              <li>One tool generated per operation</li>
              <li>Input schemas carried over as-is</li>
              <li>Re-converts automatically on spec updates</li>
            </ul>
          </div>
          <div className="f-panel">
            <div className="panel-dots"><span /><span /><span /></div>
            <div className="row-item"><span>GET /orders/&#123;id&#125;</span><span className="arrow-sep">→</span><span>get_order_by_id()</span></div>
            <div className="row-item"><span>POST /payments</span><span className="arrow-sep">→</span><span>create_payment()</span></div>
            <div className="row-item"><span>GET /inventory</span><span className="arrow-sep">→</span><span>list_inventory()</span></div>
          </div>
        </div>

        <div className="feature-row">
          <div className="f-text">
            <div className="f-eyebrow">03 · Authorize</div>
            <h3>Keycloak decides who gets what</h3>
            <p>Every request carries a Keycloak JWT. MCP Manager checks the client's roles and scopes before letting a tool run — nothing reaches an API it isn't cleared for.</p>
            <ul className="f-list">
              <li>Per-tool scopes, not just per-app access</li>
              <li>Denied calls never reach the underlying API</li>
              <li>Standard OAuth2 / OpenID Connect flow</li>
            </ul>
          </div>
          <div className="f-panel">
            <div className="panel-dots"><span /><span /><span /></div>
            <div className="row-item"><span>get_order_by_id</span><span className="status-ok">allowed</span></div>
            <div className="row-item"><span>create_payment</span><span className="status-ok">allowed</span></div>
            <div className="row-item"><span>delete_employee</span><span className="status-denied">denied</span></div>
          </div>
        </div>

        <div className="feature-row reverse">
          <div className="f-text">
            <div className="f-eyebrow">04 · Serve</div>
            <h3>One URL for every MCP client</h3>
            <p>Clients connect to a single endpoint, no matter how many APIs are registered behind it. Add or remove apps without changing anything on the client side.</p>
            <ul className="f-list">
              <li>One base URL for the whole organization</li>
              <li>New apps appear without a client update</li>
              <li>Works with any MCP-compatible client</li>
            </ul>
          </div>
          <div className="f-panel">
            <div className="panel-dots"><span /><span /><span /></div>
            <div className="mono-code"><span className="k">POST</span> https://mcp.yourcompany.com<br /><span className="k">Authorization:</span> Bearer <span className="v">&lt;keycloak_jwt&gt;</span><br /><span className="k">&#123; &quot;tool&quot;:</span> <span className="v">&quot;get_order_by_id&quot;</span> <span className="k">&#125;</span></div>
          </div>
        </div>
      </section>

      <section className="stats" id="stats">
        <div className="stats-grid">
          <div><div className="stat-num">1</div><div className="stat-label">Endpoint for every registered API</div></div>
          <div><div className="stat-num">100%</div><div className="stat-label">Of calls checked against Keycloak</div></div>
          <div><div className="stat-num">0</div><div className="stat-label">Unauthorized tools left reachable</div></div>
        </div>
      </section>

      <section className="cta-band">
        <h2>Put every API behind one secure door</h2>
        <p>Register your first OpenAPI spec and see it appear as MCP tools in minutes.</p>
        <div className="cta-row">
          <button onClick={handleLogin} disabled={loggingIn} className="btn btn-primary">
            Log in
          </button>
          <a className="btn btn-secondary" href="#how-it-works">
            Read the docs
          </a>
        </div>
      </section>

      <footer>
        <div className="footer-top">
          <div className="footer-brand">
            <div className="logo"><span className="logo-mark" /> MCP Manager</div>
            <p>Turns OpenAPI-compatible apps into MCP tools and serves them from one endpoint, secured with Keycloak.</p>
          </div>
          <div className="footer-col">
            <h4>Product</h4>
            <a href="#how-it-works">Registry</a>
            <a href="#how-it-works">Conversion</a>
            <a href="#how-it-works">Auth gateway</a>
          </div>
          <div className="footer-col">
            <h4>Resources</h4>
            <a href="#how-it-works">Docs</a>
            <a href="#stats">Status</a>
            <button onClick={handleLogin} className="bg-transparent border-none p-0 cursor-pointer text-inherit font-inherit text-left">Log in</button>
          </div>
        </div>
        <div className="footer-bottom">
          <span>MCP Manager</span>
          <span>Built for teams who ship a lot of APIs and want one secure door in.</span>
        </div>
      </footer>
    </div>
  );
}
