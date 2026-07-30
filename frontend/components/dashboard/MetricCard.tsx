import { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  iconBgColor?: string;
}

export function MetricCard({ title, value, icon, iconBgColor = 'var(--bg-elevated)' }: MetricCardProps) {
  return (
    <div className="card p-6 animate-slideInUp">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[var(--text-secondary)] text-sm font-medium mb-1">{title}</p>
          <h3 className="text-[var(--text-primary)] text-3xl font-bold">{value}</h3>
        </div>
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: iconBgColor, border: '1px solid var(--border-default)' }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
