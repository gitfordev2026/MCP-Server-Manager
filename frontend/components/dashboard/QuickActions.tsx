import Link from 'next/link';
import { Server, AppWindow, Play, MessageSquare, ArrowRight } from 'lucide-react';

export function QuickActions() {
  const actions = [
    {
      title: 'Register Server',
      description: 'Add a new MCP server connection',
      icon: <Server className="w-5 h-5" />,
      href: '/register-server',
      color: 'var(--accent-primary-soft)',
      textColor: 'var(--accent-primary)'
    },
    {
      title: 'Register App',
      description: 'Add a new application Base URL',
      icon: <AppWindow className="w-5 h-5" />,
      href: '/register-app',
      color: 'var(--accent-purple-soft, #f3e8ff)',
      textColor: 'var(--accent-purple, #9333ea)'
    },
    {
      title: 'Playground',
      description: 'Test MCP tools interactively',
      icon: <Play className="w-5 h-5" />,
      href: '/playground',
      color: 'var(--accent-success-soft)',
      textColor: 'var(--accent-success)'
    },
    {
      title: 'Chat',
      description: 'Chat with AI using your tools',
      icon: <MessageSquare className="w-5 h-5" />,
      href: '/chat',
      color: 'var(--accent-warning-soft)',
      textColor: 'var(--accent-warning)'
    }
  ];

  return (
    <div className="mb-8 animate-fadeIn" style={{ animationDelay: '0.2s' }}>
      <h2 className="text-[var(--text-primary)] text-lg font-bold mb-4">Quick Actions</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {actions.map((action, i) => (
          <Link href={action.href} key={i}>
            <div className="card p-4 group hover:border-[var(--border-strong)] transition-all cursor-pointer h-full flex flex-col justify-between">
              <div>
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-transform group-hover:scale-110"
                  style={{ backgroundColor: action.color, color: action.textColor }}
                >
                  {action.icon}
                </div>
                <h3 className="text-[var(--text-primary)] font-semibold text-sm mb-1">{action.title}</h3>
                <p className="text-[var(--text-tertiary)] text-xs mb-3">{action.description}</p>
              </div>
              <div className="flex items-center text-xs font-medium" style={{ color: action.textColor }}>
                <span>Get started</span>
                <ArrowRight className="w-3 h-3 ml-1 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
