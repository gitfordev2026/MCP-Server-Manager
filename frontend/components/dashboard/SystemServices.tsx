import { SystemStatus } from '@/app/dashboard/page';

interface SystemServicesProps {
  systems: SystemStatus[];
}

export function SystemServices({ systems }: SystemServicesProps) {
  if (!systems || systems.length === 0) return null;

  return (
    <div className="mb-8 animate-fadeIn" style={{ animationDelay: '0.1s' }}>
      <h2 className="text-[var(--text-primary)] text-lg font-bold mb-4">System Services</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {systems.map((system) => {
          let badgeClass = 'badge';
          if (system.status === 'up') badgeClass = 'badge badge-success';
          else if (system.status === 'down') badgeClass = 'badge badge-danger';
          else if (system.status === 'disabled') badgeClass = 'badge badge-warning';

          return (
            <div key={system.key} className="card p-4 hover:border-[var(--border-strong)] transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[var(--text-primary)] font-semibold text-sm">{system.name}</span>
                <span className={badgeClass}>
                  {system.status === 'up' ? 'Online' : system.status === 'down' ? 'Offline' : 'Disabled'}
                </span>
              </div>
              <p className="text-[var(--text-tertiary)] text-xs line-clamp-2">
                {system.detail}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
