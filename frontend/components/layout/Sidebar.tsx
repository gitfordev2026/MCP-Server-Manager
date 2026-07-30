'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useSidebar } from '@/context/SidebarContext';
import { useUser } from '@/context/UserContext';
import {
  LayoutDashboard,
  Server,
  AppWindow,
  Network,
  Play,
  MessageSquare,
  BookOpen,
  Shield,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Menu,
} from 'lucide-react';

/* ── Navigation Item Definition ── */
interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  section?: 'main' | 'manage';
}

export default function Sidebar() {
  const pathname = usePathname();
  const { collapsed, mobileOpen, toggle, closeMobile } = useSidebar();
  const { user, role: contextRole, isAdmin } = useUser();
  const role = contextRole || user?.primary_role || null;

  // Close mobile sidebar on route change
  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  const mainNav: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/register-server', label: 'MCP Servers', icon: Server },
    { href: '/register-app', label: 'Applications', icon: AppWindow },
    { href: '/mcp-endpoints', label: 'Endpoints', icon: Network },
    { href: '/playground', label: 'Playground', icon: Play },
    { href: '/chat', label: 'Chat', icon: MessageSquare },
    { href: '/docs', label: 'Documentation', icon: BookOpen },
  ];

  const manageNav: NavItem[] = [
    ...(role === 'admin' || role === 'developer'
      ? [{ href: '/access-control', label: 'Access Control', icon: Shield }]
      : []),
    ...(role === 'admin' || role === 'developer'
      ? [{ href: '/admin', label: 'Admin', icon: Settings }]
      : []),
  ];

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/';
    if (href === '/register-server') return pathname === '/register-server' || pathname.startsWith('/servers/');
    if (href === '/register-app') return pathname === '/register-app' || pathname.startsWith('/register-app/');
    return pathname === href || pathname.startsWith(href + '/');
  };

  const userInitial = user?.username?.[0]?.toUpperCase() || 'U';

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`sidebar-backdrop ${mobileOpen ? 'visible' : ''}`}
        onClick={closeMobile}
        aria-hidden="true"
      />

      <aside
        className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* ── Logo ── */}
        <div className="sidebar-logo">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="sidebar-logo-text overflow-hidden">
            <div className="text-sm font-bold text-[var(--text-primary)] leading-tight truncate">MCP Manager</div>
            <div className="text-[0.6875rem] text-[var(--text-muted)] leading-tight truncate">Server Manager</div>
          </div>
        </div>

        {/* ── Main Navigation ── */}
        <nav className="sidebar-nav">
          <div className="sidebar-section">
            {!collapsed && <div className="sidebar-section-title">Navigation</div>}
            {mainNav.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-item ${active ? 'active' : ''}`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="sidebar-item-icon" />
                  <span className="sidebar-item-label">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {manageNav.length > 0 && (
            <>
              <div className="sidebar-divider" />
              <div className="sidebar-section">
                {!collapsed && <div className="sidebar-section-title">Management</div>}
                {manageNav.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`sidebar-item ${active ? 'active' : ''}`}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="sidebar-item-icon" />
                      <span className="sidebar-item-label">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </nav>

        {/* ── Footer ── */}
        <div className="sidebar-footer">
          {/* Collapse Toggle */}
          <button
            onClick={toggle}
            className="sidebar-item w-full mb-2 hidden md:flex"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronsRight className="sidebar-item-icon" />
            ) : (
              <ChevronsLeft className="sidebar-item-icon" />
            )}
            <span className="sidebar-item-label">Collapse</span>
          </button>

          {/* User Profile */}
          <div className="sidebar-user" title={collapsed ? user?.username || 'User' : undefined}>
            <div className="sidebar-avatar">{userInitial}</div>
            <div className="sidebar-user-info overflow-hidden">
              <div className="text-[0.8125rem] font-medium text-[var(--text-primary)] truncate">
                {user?.username || 'User'}
              </div>
              <div className="text-[0.6875rem] text-[var(--text-muted)] truncate capitalize">
                {role || 'User'}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ── Mobile Toggle Button (used in Header) ── */
export function SidebarMobileToggle() {
  const { openMobile } = useSidebar();
  return (
    <button
      onClick={openMobile}
      className="md:hidden p-2 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors"
      aria-label="Open navigation menu"
    >
      <Menu className="w-5 h-5" />
    </button>
  );
}
