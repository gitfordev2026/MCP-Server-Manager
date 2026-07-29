'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/context/ThemeContext';
import { publicEnv } from '@/lib/env';
import {
  buildLogoutUrl,
  clearTokens,
  fetchAuthConfig,
  getStoredToken,
  type AuthConfig,
} from '@/lib/auth';

import UserHeader from '@/components/UserHeader';
import { useUser } from '@/context/UserContext';

interface NavigationProps {
  pageTitle?: string;
  isDark?: boolean;
}

export default function Navigation({ pageTitle, isDark: isDarkProp }: NavigationProps) {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const showLogout = hasToken || authEnabled === false;

  const baseInactiveClass =
    'bg-slate-100 text-slate-800 hover:bg-slate-200 hover:text-slate-900 border border-slate-200/90 shadow-2xs dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white dark:border-slate-700';

  const { user, role: contextRole } = useUser();
  const role = contextRole || user?.primary_role || null;

  const navItems = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      featureKey: 'dashboard',
      isActive: pathname === '/dashboard',
      activeClass: 'bg-blue-600 text-white hover:bg-blue-700 hover:text-white shadow-md shadow-blue-500/25 font-bold',
    },
    {
      href: '/register-server',
      label: 'Register MCP',
      featureKey: 'mcp_endpoints',
      isActive: pathname === '/register-server' || pathname.includes('/servers/'),
      activeClass: 'bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white shadow-md shadow-emerald-500/25 font-bold',
    },
    {
      href: '/register-app',
      label: 'Register App',
      featureKey: 'api_explorer',
      isActive: pathname === '/register-app' || pathname.includes('/register-app/'),
      activeClass: 'bg-indigo-600 text-white hover:bg-indigo-700 hover:text-white shadow-md shadow-indigo-500/25 font-bold',
    },
    {
      href: '/mcp-endpoints',
      label: 'MCP Endpoints',
      featureKey: 'mcp_endpoints',
      isActive: pathname === '/mcp-endpoints',
      activeClass: 'bg-purple-600 text-white hover:bg-purple-700 hover:text-white shadow-md shadow-purple-500/25 font-bold',
    },
    {
      href: '/playground',
      label: 'Playground',
      featureKey: 'playground',
      isActive: pathname === '/playground',
      activeClass: 'bg-amber-600 text-white hover:bg-amber-700 hover:text-white shadow-md shadow-amber-500/25 font-bold',
    },
    {
      href: '/chat',
      label: 'Chat',
      featureKey: 'chat',
      isActive: pathname === '/chat',
      activeClass: 'bg-violet-600 text-white hover:bg-violet-700 hover:text-white shadow-md shadow-violet-500/25 font-bold',
    },
    ...(role === 'admin' || role === 'developer' ? [{
      href: '/admin',
      label: 'Admin',
      featureKey: 'admin_panel',
      isActive: pathname === '/admin',
      activeClass: 'bg-rose-600 text-white hover:bg-rose-700 hover:text-white shadow-md shadow-rose-500/25 font-bold',
    }] : []),
  ];

  const getPageName = () => {
    if (pageTitle) return pageTitle;

    switch (pathname) {
      case '/':
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

  return (
    <>
      <nav className="fixed top-0 w-full z-50 transition-colors duration-200 bg-white/95 dark:bg-slate-900/95 border-b border-slate-200/90 dark:border-slate-800 shadow-xs backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/dashboard" className="flex-shrink-0">
            <div className="flex items-center gap-3 cursor-pointer hover:opacity-90 transition-opacity">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm shadow-blue-500/30 text-white font-bold text-lg">
                M
              </div>
              <div className="flex flex-col">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                  MCP Server Manager
                </h1>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {getPageName()}
                </p>
              </div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-2 flex-1 justify-end">
            <div className="flex items-center gap-1.5 overflow-x-auto pr-2">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <span
                    className={`inline-flex items-center justify-center flex-shrink-0 whitespace-nowrap text-xs px-3.5 py-2 rounded-xl transition-all duration-200 cursor-pointer ${
                      item.isActive ? item.activeClass : baseInactiveClass
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              ))}
            </div>

            {/* Theme Toggle & User Profile Header */}
            <div className="flex items-center gap-3 pl-2 border-l border-slate-200 dark:border-slate-800">
              <ThemeToggle />
              <UserHeader />
            </div>
          </div>

          {/* Mobile Actions */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMobileOpen((prev) => !prev)}
              className="inline-flex items-center justify-center p-2 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
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

        {/* Mobile menu dropdown */}
        {mobileOpen && (
          <div className="border-t border-slate-200 dark:border-slate-800 md:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-4 py-3 grid gap-1.5">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
                  <span
                    className={`block w-full text-left text-xs px-4 py-2.5 rounded-xl transition-all duration-200 ${
                      item.isActive ? item.activeClass : baseInactiveClass
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              ))}
              {showLogout && (
                <button
                  type="button"
                  className={`w-full text-left text-xs font-semibold px-4 py-2.5 rounded-xl ${baseInactiveClass}`}
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  {loggingOut ? 'Logging out...' : 'Logout'}
                </button>
              )}
            </div>
          </div>
        )}
      </nav>
      <div className="h-[68px]" aria-hidden="true" />
    </>
  );
}
