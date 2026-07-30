'use client';

/**
 * LEGACY NAVIGATION COMPONENT
 * 
 * This component is now a no-op. The sidebar + header layout is handled
 * by AppShell in the root layout. This stub is kept so existing pages
 * that import <Navigation /> don't break during the incremental migration.
 * 
 * TODO: Remove all <Navigation /> imports from individual pages.
 */

interface NavigationProps {
  pageTitle?: string;
  isDark?: boolean;
}

export default function Navigation(_props: NavigationProps) {
  // AppShell now handles all navigation — render nothing
  return null;
}
