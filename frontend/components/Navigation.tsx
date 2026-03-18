'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { publicEnv } from '@/lib/env';
import {
  buildLogoutUrl,
  clearTokens,
  fetchAuthConfig,
  getStoredToken,
  type AuthConfig,
} from '@/lib/auth';

interface NavigationProps {
  pageTitle?: string;
  isDark?: boolean;
}

export default function Navigation({ pageTitle, isDark = false }: NavigationProps) {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const showLogout = hasToken || authEnabled === false;
  const inactiveButtonClasses = isDark
    ? 'bg-slate-800/70 text-slate-200 hover:bg-slate-700/80 border border-slate-600/50'
    : 'bg-white/50 text-slate-700 hover:bg-white/70 border border-slate-200/50';
  const inactiveMobileButtonClasses = isDark
    ? 'bg-slate-800/70 text-slate-200 border border-slate-600/50'
    : 'bg-white/70 text-slate-700 border border-slate-200/50';

  const getPageName = () => {
    if (pageTitle) return pageTitle;

    switch (pathname) {
      case '/':
        return 'Dashboard';
      case '/dashboard':
        return 'Dashboard';
      case '/register-server':
        return 'Fetch MCP Tools';
      case '/register-app':
        return 'Fetch APIs';
      case '/mcp-endpoints':
        return 'MCP Endpoints';
      case '/chat':
        return 'Chat';
      case '/playground':
        return 'Playground';
      case '/admin':
        return 'Admin Panel';
      case '/api-explorer':
        return 'API Explorer';
      default:
        if (pathname.includes('/register-app/')) return 'App Details';
        if (pathname.includes('/servers/')) return 'Server Details';
        return 'MCP Server Manager';
    }
  };

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const config: AuthConfig = await fetchAuthConfig(publicEnv.NEXT_PUBLIC_BE_API_URL);
      clearTokens();
      if (config.auth_enabled && config.logout_endpoint) {
        window.location.href = buildLogoutUrl(config);
        return;
      }
    } catch {
      clearTokens();
    } finally {
      setLoggingOut(false);
    }
    window.location.href = '/login';
  }, [loggingOut]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const config: AuthConfig = await fetchAuthConfig(publicEnv.NEXT_PUBLIC_BE_API_URL);
        if (!cancelled) setAuthEnabled(config.auth_enabled);
      } catch {
        if (!cancelled) setAuthEnabled(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setHasToken(Boolean(getStoredToken()));
  }, [pathname]);

  useEffect(() => {
    const update = () => {
      if (typeof window === 'undefined') return;
      setIsDesktop(window.innerWidth >= 768);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <>
      <nav
        className={`fixed top-0 w-full z-100 ${isDark
          ? 'bg-gradient-to-r from-slate-900/95 to-slate-800/95 border-b border-slate-700/50 shadow-lg shadow-slate-900/50'
          : 'bg-gradient-to-r from-white/95 to-slate-50/95 border-b border-amber-400/30 shadow-lg shadow-amber-200/20'
          } backdrop-blur-3xl transition-all duration-500`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">

          {/* Logo - fixed width, never shrinks */}
          <Link href="/" className="flex-shrink-0">
            <div className="flex items-center gap-2 cursor-pointer hover:scale-105 transition-transform duration-300">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/30">
                <span className="text-lg font-bold text-slate-950">M</span>
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-bold bg-gradient-to-r from-amber-400 to-amber-300 bg-clip-text text-transparent whitespace-nowrap leading-none">
                  MCP Server Manager
                </h1>
                <p className={`text-xs font-medium whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {getPageName()}
                </p>
              </div>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className={`${isDesktop ? 'flex' : 'hidden'} flex-1 items-center gap-2`}>
            <div className="flex-1 overflow-x-auto">
              <div className="flex gap-2 items-center justify-end flex-nowrap pr-2">
              <Link href="/"><Button variant="ghost" className={`flex-shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold transition-all duration-300 hover:scale-105 ${pathname === '/' ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-300/30' : inactiveButtonClasses}`}>Dashboard</Button></Link>

              <Link href="/register-server"><Button variant="ghost" className={`flex-shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold transition-all duration-300 hover:scale-105 ${pathname === '/register-server' || pathname.includes('/servers/') ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-300/30' : inactiveButtonClasses}`}>Register MCP</Button></Link>

              <Link href="/register-app"><Button variant="ghost" className={`flex-shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold transition-all duration-300 hover:scale-105 ${pathname === '/register-app' || pathname.includes('/register-app/') ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-300/30' : inactiveButtonClasses}`}>Register App</Button></Link>

              <Link href="/mcp-endpoints"><Button variant="ghost" className={`flex-shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold transition-all duration-300 hover:scale-105 ${pathname === '/mcp-endpoints' ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-md shadow-purple-300/30' : inactiveButtonClasses}`}>MCP Endpoints</Button></Link>

              <Link href="/playground"><Button variant="ghost" className={`flex-shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold transition-all duration-300 hover:scale-105 ${pathname === '/playground' ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-md shadow-rose-300/30' : inactiveButtonClasses}`}>Playground</Button></Link>

              <Link href="/chat"><Button variant="ghost" className={`flex-shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold transition-all duration-300 hover:scale-105 ${pathname === '/chat' ? 'bg-gradient-to-r from-violet-500 to-violet-600 text-white shadow-md shadow-violet-300/30' : inactiveButtonClasses}`}>Chat</Button></Link>

              <Link href="/admin"><Button variant="ghost" className={`flex-shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold transition-all duration-300 hover:scale-105 ${pathname === '/admin' ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-md shadow-rose-300/30' : inactiveButtonClasses}`}>Admin</Button></Link>
              </div>
            </div>
            {showLogout && (
              <Button
                variant="ghost"
                className={`flex-shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold transition-all duration-300 hover:scale-105 border ${isDark ? 'bg-slate-800/70 text-slate-200 border-slate-600/50 hover:bg-slate-700/80' : 'bg-white/70 text-slate-700 hover:bg-white/90 border-slate-200/50'}`}
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? 'Logging out...' : 'Logout'}
              </Button>
            )}
          </div>

          {/* Mobile toggle */}
          <div className={`${isDesktop ? 'hidden' : 'flex'} flex-1 justify-end`}>
            <button
              type="button"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((prev) => !prev)}
              className={`inline-flex items-center justify-center h-10 w-10 rounded-lg border transition-all ${isDark
                ? 'border-slate-700 bg-slate-900/70 text-slate-200 hover:bg-slate-800'
                : 'border-slate-200 bg-white/70 text-slate-700 hover:bg-white'
                }`}
            >
              <span className="sr-only">{mobileOpen ? 'Close menu' : 'Open menu'}</span>
              <svg
                className={`h-5 w-5 transition-transform ${mobileOpen ? 'rotate-90' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {mobileOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
          </div>

        </div>

        {/* Mobile menu */}
        {!isDesktop && mobileOpen && (
          <div className={`border-t ${isDark ? 'border-slate-700/60' : 'border-amber-200/60'}`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 grid gap-2">
              <Link href="/" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className={`w-full justify-start whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold ${pathname === '/' ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-300/30' : inactiveMobileButtonClasses}`}>Dashboard</Button>
              </Link>
              <Link href="/register-server" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className={`w-full justify-start whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold ${pathname === '/register-server' || pathname.includes('/servers/') ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-300/30' : inactiveMobileButtonClasses}`}>Register MCP</Button>
              </Link>
              <Link href="/register-app" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className={`w-full justify-start whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold ${pathname === '/register-app' || pathname.includes('/register-app/') ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-300/30' : inactiveMobileButtonClasses}`}>Register App</Button>
              </Link>
              <Link href="/mcp-endpoints" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className={`w-full justify-start whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold ${pathname === '/mcp-endpoints' ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-md shadow-purple-300/30' : inactiveMobileButtonClasses}`}>MCP Endpoints</Button>
              </Link>
              <Link href="/playground" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className={`w-full justify-start whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold ${pathname === '/playground' ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-md shadow-rose-300/30' : inactiveMobileButtonClasses}`}>Playground</Button>
              </Link>
              <Link href="/chat" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className={`w-full justify-start whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold ${pathname === '/chat' ? 'bg-gradient-to-r from-violet-500 to-violet-600 text-white shadow-md shadow-violet-300/30' : inactiveMobileButtonClasses}`}>Chat</Button>
              </Link>
              <Link href="/admin" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className={`w-full justify-start whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold ${pathname === '/admin' ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-md shadow-rose-300/30' : inactiveMobileButtonClasses}`}>Admin</Button>
              </Link>
              {showLogout && (
                <Button
                  variant="ghost"
                  className={`w-full justify-start whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold border ${isDark ? 'bg-slate-800/70 text-slate-200 border-slate-600/50' : 'bg-white/70 text-slate-700 border-slate-200/50'}`}
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  {loggingOut ? 'Logging out...' : 'Logout'}
                </Button>
              )}
            </div>
          </div>
        )}
      </nav>
      <div className="h-[80px]" aria-hidden="true"></div>
    </>
  );
}
