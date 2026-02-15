'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Button from '@/components/ui/Button';

interface NavigationProps {
  pageTitle?: string;
  isDark?: boolean;
}

export default function Navigation({ pageTitle, isDark = false }: NavigationProps) {
  const pathname = usePathname();

  const getPageName = () => {
    if (pageTitle) return pageTitle;

    switch (pathname) {
      case '/':
        return 'Dashboard';
      case '/dashboard':
        return 'Dashboard';
      case '/register-server':
        return 'Register Server';
      case '/register-app':
        return 'Register App';
      case '/access-control':
        return 'Access Control';
      case '/mcp-endpoints':
        return 'MCP Endpoints';
      case '/chat':
        return 'Chat';
      case '/api-explorer':
        return 'API Explorer';
      default:
        if (pathname.includes('/register-app/')) return 'App Details';
        if (pathname.includes('/servers/')) return 'Server Details';
        return 'MCP Server Manager';
    }
  };

  return (
    <nav
      className={`fixed top-0 w-full z-50 ${isDark
          ? 'bg-gradient-to-r from-slate-900/95 to-slate-800/95 border-b border-slate-700/50 shadow-lg shadow-slate-900/50'
          : 'bg-gradient-to-r from-white/95 to-slate-50/95 border-b border-amber-400/30 shadow-lg shadow-amber-200/20'
        } backdrop-blur-3xl transition-all duration-500`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center gap-4">
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer hover:scale-105 transition-transform duration-300">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/30">
              <span className="text-lg font-bold text-slate-950">M</span>
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-amber-300 bg-clip-text text-transparent">
                MCP Server Manager
              </h1>
              <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{getPageName()}</p>
            </div>
          </div>
        </Link>

        <div className="flex gap-2 md:gap-3 items-center flex-wrap justify-end">
          <Link href="/">
            <Button
              className={`px-4 py-2 rounded-lg text-sm md:text-base font-bold transition-all duration-300 hover:scale-105 ${pathname === '/'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 shadow-md shadow-amber-300/30'
                  : 'bg-white/50 text-slate-700 hover:bg-white/70 border border-slate-200/50'
                }`}
            >
              Dashboard
            </Button>
          </Link>

          <Link href="/register-server">
            <Button
              className={`px-4 py-2 rounded-lg text-sm md:text-base font-bold transition-all duration-300 hover:scale-105 ${pathname === '/register-server' || pathname.includes('/servers/')
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-md shadow-emerald-300/30'
                  : 'bg-white/50 text-slate-700 hover:bg-white/70 border border-slate-200/50'
                }`}
            >
              Register Server
            </Button>
          </Link>

          <Link href="/register-app">
            <Button
              className={`px-4 py-2 rounded-lg text-sm md:text-base font-bold transition-all duration-300 hover:scale-105 ${pathname === '/register-app' || pathname.includes('/register-app/')
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 shadow-md shadow-blue-300/30'
                  : 'bg-white/50 text-slate-700 hover:bg-white/70 border border-slate-200/50'
                }`}
            >
              Register App
            </Button>
          </Link>

          <Link href="/access-control">
            <Button
              className={`px-4 py-2 rounded-lg text-sm md:text-base font-bold transition-all duration-300 hover:scale-105 ${pathname === '/access-control'
                  ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 shadow-md shadow-indigo-300/30'
                  : 'bg-white/50 text-slate-700 hover:bg-white/70 border border-slate-200/50'
                }`}
            >
              Access Control
            </Button>
          </Link>

          <Link href="/mcp-endpoints">
            <Button
              className={`px-4 py-2 rounded-lg text-sm md:text-base font-bold transition-all duration-300 hover:scale-105 ${pathname === '/mcp-endpoints'
                  ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 shadow-md shadow-purple-300/30'
                  : 'bg-white/50 text-slate-700 hover:bg-white/70 border border-slate-200/50'
                }`}
            >
              MCP Endpoints
            </Button>
          </Link>

          <Link href="/chat">
            <Button
              className={`px-4 py-2 rounded-lg text-sm md:text-base font-bold transition-all duration-300 hover:scale-105 ${pathname === '/chat'
                  ? 'bg-gradient-to-r from-violet-500 to-violet-600 text-white hover:from-violet-600 hover:to-violet-700 shadow-md shadow-violet-300/30'
                  : 'bg-white/50 text-slate-700 hover:bg-white/70 border border-slate-200/50'
                }`}
            >
              Chat
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
