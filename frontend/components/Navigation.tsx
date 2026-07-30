'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
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
import CommandKModal from '@/components/CommandKModal';

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
  const [commandKOpen, setCommandKOpen] = useState(false);
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  
  // Workspace Switcher mock state
  const [workspace, setWorkspace] = useState('Default Workspace');
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  // Sidebar collapsed state with localStorage persistence
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mcp_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('mcp_sidebar_collapsed', String(next));
      }
      return next;
    });
  };

  // Keyboard shortcut listener for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandKOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sync body padding with sidebar width on desktop
  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') return;
      if (window.innerWidth < 768) {
        document.body.style.paddingLeft = '0px';
      } else {
        document.body.style.paddingLeft = isCollapsed ? '80px' : '256px';
      }
    };

    document.body.style.transition = 'padding-left 300ms cubic-bezier(0.16, 1, 0.3, 1)';
    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isCollapsed]);

  useEffect(() => {
    async function loadRole() {
      try {
        const res = await fetch('/api/proxy/api/me');
        if (res.ok) {
          const data = await res.json();
          setRole(data.primary_role);
        }
      } catch (err) {
        console.error('Navigation: failed to load user role', err);
      }
    }
    loadRole();
  }, []);

  const navItems = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      isActive: pathname === '/dashboard' || pathname === '/',
      activeClass: 'bg-blue-600 text-white shadow-md shadow-blue-500/25 font-bold',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      href: '/mcp-endpoints',
      label: 'MCP Endpoints',
      isActive: pathname === '/mcp-endpoints',
      activeClass: 'bg-purple-600 text-white shadow-md shadow-purple-500/25 font-bold',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      ),
    },
    {
      href: '/docs',
      label: 'Documentation',
      isActive: pathname === '/docs',
      activeClass: 'bg-emerald-600 text-white shadow-md shadow-emerald-500/25 font-bold',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      href: '/register-server',
      label: 'Register MCP',
      isActive: pathname === '/register-server' || pathname.includes('/servers/'),
      activeClass: 'bg-emerald-600 text-white shadow-md shadow-emerald-500/25 font-bold',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
      ),
    },
    {
      href: '/register-app',
      label: 'Register App',
      isActive: pathname === '/register-app' || pathname.includes('/register-app/'),
      activeClass: 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25 font-bold',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
    {
      href: '/playground',
      label: 'Playground',
      isActive: pathname === '/playground',
      activeClass: 'bg-amber-600 text-white shadow-md shadow-amber-500/25 font-bold',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      href: '/inspector',
      label: 'MCP Inspector',
      isActive: pathname === '/inspector',
      activeClass: 'bg-cyan-600 text-white shadow-md shadow-cyan-500/25 font-bold',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
    },
    {
      href: '/chat',
      label: 'Chat',
      isActive: pathname === '/chat',
      activeClass: 'bg-violet-600 text-white shadow-md shadow-violet-500/25 font-bold',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
    ...(role === 'admin' || role === 'developer' ? [{
      href: '/admin',
      label: 'Admin Panel',
      isActive: pathname === '/admin',
      activeClass: 'bg-rose-600 text-white shadow-md shadow-rose-500/25 font-bold',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    }] : []),
  ];

  const getPageName = () => {
    if (pageTitle) return pageTitle;

    switch (pathname) {
      case '/':
      case '/dashboard':
        return 'Operational Dashboard';
      case '/mcp-endpoints':
        return 'MCP Endpoints Portal';
      case '/docs':
        return 'Developer Documentation';
      case '/register-server':
        return 'Register MCP Server';
      case '/register-app':
        return 'Register Web App';
      case '/chat':
        return 'AI Agent Chat';
      case '/playground':
        return 'Tool Playground';
      case '/inspector':
        return 'MCP Inspector Helper';
      case '/admin':
        return 'Admin Management';
      case '/api-explorer':
        return 'API Explorer';
      default:
        if (pathname.includes('/register-app/')) return 'App Details';
        if (pathname.includes('/servers/')) return 'Server Details';
        return 'MCP Server Manager';
    }
  };

  const handleCopyApiUrl = () => {
    const url = `${window.location.origin}/api/proxy/mcp/apps/`;
    navigator.clipboard?.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const baseInactiveClass =
    'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/80';

  return (
    <>
      {/* ---------------------------------------------------- */}
      {/* STICKY TOP HEADER                                    */}
      {/* ---------------------------------------------------- */}
      <header className="hidden md:flex fixed top-0 right-0 z-30 h-16 items-center justify-between px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-all duration-300 left-[var(--sidebar-width,256px)]" style={{ left: isCollapsed ? '80px' : '256px' }}>
        {/* Contextual Breadcrumbs */}
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <Link href="/dashboard" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            MCP Manager
          </Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-slate-100 font-bold">{getPageName()}</span>
        </div>

        {/* Global Search & Top Action Bar */}
        <div className="flex items-center gap-3">
          {/* Command-K Search Trigger */}
          <button
            type="button"
            onClick={() => setCommandKOpen(true)}
            className="flex items-center gap-3 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-all shadow-2xs"
          >
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>Quick search commands...</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md">
              ⌘K
            </kbd>
          </button>

          {/* Quick Copy API Endpoint */}
          <button
            type="button"
            onClick={handleCopyApiUrl}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            <span>{copiedUrl ? 'Copied Proxy URL!' : 'Copy Proxy URL'}</span>
          </button>
        </div>
      </header>

      {/* Top Spacer for Desktop Header */}
      <div className="hidden md:block h-16" aria-hidden="true" />

      {/* ---------------------------------------------------- */}
      {/* ADAPTIVE COLLAPSIBLE SIDEBAR                          */}
      {/* ---------------------------------------------------- */}
      <aside
        className={`hidden md:flex fixed top-0 left-0 bottom-0 z-40 flex-col bg-white/95 dark:bg-slate-900/95 border-r border-slate-200/90 dark:border-slate-800 shadow-md backdrop-blur-xl transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Sidebar Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200/90 dark:border-slate-800 flex-shrink-0">
          <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-500/30 text-white font-bold text-lg flex-shrink-0">
              M
            </div>
            {!isCollapsed && (
              <div className="flex flex-col truncate">
                <h1 className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">
                  MCP Manager
                </h1>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Enterprise Platform
                </p>
              </div>
            )}
          </Link>

          {/* Collapse Toggle Button */}
          <button
            type="button"
            onClick={toggleCollapse}
            className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
              isCollapsed ? 'mx-auto' : ''
            }`}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Workspace Switcher */}
        {!isCollapsed && (
          <div className="p-3 border-b border-slate-200/60 dark:border-slate-800/60">
            <div className="relative">
              <button
                type="button"
                onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="truncate">{workspace}</span>
                </div>
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {workspaceMenuOpen && (
                <div className="absolute top-full left-0 mt-1 w-full z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-1 space-y-1">
                  {['Default Workspace', 'Staging Workspace', 'Production Org'].map((ws) => (
                    <button
                      key={ws}
                      onClick={() => {
                        setWorkspace(ws);
                        setWorkspaceMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
                    >
                      {ws}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 scrollbar-thin">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} title={isCollapsed ? item.label : undefined}>
              <span
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm cursor-pointer ${
                  item.isActive ? item.activeClass : baseInactiveClass
                } ${isCollapsed ? 'justify-center' : ''}`}
              >
                {item.icon}
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </span>
            </Link>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-200/90 dark:border-slate-800 flex-shrink-0 space-y-2">
          {/* Theme Mode Control */}
          <div className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-1'}`}>
            {!isCollapsed && (
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Theme Mode
              </span>
            )}
            <ThemeToggle />
          </div>

          {/* User Profile Card */}
          <div className="w-full pt-1">
            <UserHeader isCollapsed={isCollapsed} />
          </div>
        </div>
      </aside>

      {/* ---------------------------------------------------- */}
      {/* MOBILE HEADER BAR & OVERLAY                           */}
      {/* ---------------------------------------------------- */}
      <nav className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 border-b border-slate-200/90 dark:border-slate-800 shadow-xs backdrop-blur-xl">
        <div className="px-4 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-sm">
              M
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                MCP Server Manager
              </h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {getPageName()}
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCommandKOpen(true)}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
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
          <div className="border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl">
            <div className="px-4 py-3 grid gap-1.5">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
                  <span
                    className={`flex items-center gap-3 w-full text-left text-xs px-4 py-2.5 rounded-xl transition-all duration-200 ${
                      item.isActive ? item.activeClass : baseInactiveClass
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                </Link>
              ))}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <UserHeader isCollapsed={false} />
              </div>
            </div>
          </div>
        )}
      </nav>
      {/* Mobile top spacer */}
      <div className="h-14 md:hidden" aria-hidden="true" />

      {/* Command-K Search Modal */}
      <CommandKModal isOpen={commandKOpen} onClose={() => setCommandKOpen(false)} />
    </>
  );
}
