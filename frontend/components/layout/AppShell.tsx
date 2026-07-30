'use client';

import { usePathname } from 'next/navigation';
import { useSidebar } from '@/context/SidebarContext';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

/* Routes that should NOT show the sidebar/header shell */
const AUTH_ROUTES = ['/login', '/auth', '/access-denied', '/unauthorized'];
const LANDING_ROUTES = ['/', '/new'];

function isShellRoute(pathname: string): boolean {
  // Landing pages and auth pages skip the shell
  if (LANDING_ROUTES.includes(pathname)) return false;
  for (const route of AUTH_ROUTES) {
    if (pathname === route || pathname.startsWith(route + '/')) return false;
  }
  return true;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();

  if (!isShellRoute(pathname)) {
    // Auth/landing pages render without shell
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div
        className="app-content transition-[margin-left] duration-300"
        style={{
          marginLeft: collapsed
            ? 'var(--sidebar-width-collapsed)'
            : 'var(--sidebar-width)',
        }}
      >
        <Header />
        <main className="page-container animate-fadeIn">
          {children}
        </main>
      </div>
    </div>
  );
}
