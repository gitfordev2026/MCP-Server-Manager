'use client';

import { usePathname } from 'next/navigation';
import { useSidebar } from '@/context/SidebarContext';
import { useUser } from '@/context/UserContext';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import { SidebarMobileToggle } from '@/components/layout/Sidebar';
import { Bell, Search } from 'lucide-react';
import UserHeader from '@/components/UserHeader';

/* ── Route Label Map ── */
const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/register-server': 'MCP Servers',
  '/register-app': 'Applications',
  '/mcp-endpoints': 'Endpoints',
  '/playground': 'Playground',
  '/chat': 'Chat',
  '/docs': 'Documentation',
  '/access-control': 'Access Control',
  '/admin': 'Admin',
  '/admin/feedback': 'Feedback',
  '/api-explorer': 'API Explorer',
};

function getBreadcrumbs(pathname: string): { label: string; href?: string }[] {
  const crumbs: { label: string; href?: string }[] = [];

  // Root
  if (pathname === '/' || pathname === '/dashboard') {
    crumbs.push({ label: 'Dashboard' });
    return crumbs;
  }

  // Known routes
  const directLabel = ROUTE_LABELS[pathname];
  if (directLabel) {
    crumbs.push({ label: directLabel });
    return crumbs;
  }

  // Dynamic routes
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'servers' && segments[1]) {
    crumbs.push({ label: 'MCP Servers', href: '/register-server' });
    crumbs.push({ label: decodeURIComponent(segments[1]) });
    return crumbs;
  }
  if (segments[0] === 'register-app' && segments[1]) {
    crumbs.push({ label: 'Applications', href: '/register-app' });
    crumbs.push({ label: decodeURIComponent(segments[1]) });
    return crumbs;
  }
  if (segments[0] === 'dashboard' && segments[1]) {
    crumbs.push({ label: 'Dashboard', href: '/dashboard' });
    crumbs.push({ label: segments[1] });
    return crumbs;
  }
  if (segments[0] === 'admin' && segments[1]) {
    crumbs.push({ label: 'Admin', href: '/admin' });
    crumbs.push({ label: segments[1].charAt(0).toUpperCase() + segments[1].slice(1) });
    return crumbs;
  }

  // Fallback
  crumbs.push({ label: segments[segments.length - 1]?.replace(/-/g, ' ') || 'Page' });
  return crumbs;
}

export default function Header() {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const crumbs = getBreadcrumbs(pathname);

  return (
    <header className="app-header">
      <div className="flex items-center gap-3">
        <SidebarMobileToggle />

        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5">
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <svg className="w-3.5 h-3.5 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              )}
              {crumb.href ? (
                <a
                  href={crumb.href}
                  className="text-[0.8125rem] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {crumb.label}
                </a>
              ) : (
                <span className="text-[0.8125rem] font-medium text-[var(--text-primary)]">
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        {/* Search Button */}
        <button
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-muted)] text-xs hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
          aria-label="Search"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search...</span>
          <kbd className="ml-3 px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[0.625rem] font-mono text-[var(--text-muted)]">
            ⌘K
          </kbd>
        </button>

        {/* Notifications */}
        <button
          className="p-2 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors relative"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
        </button>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* User */}
        <div className="hidden sm:block pl-2 border-l border-[var(--border-default)]">
          <UserHeader />
        </div>
      </div>
    </header>
  );
}
