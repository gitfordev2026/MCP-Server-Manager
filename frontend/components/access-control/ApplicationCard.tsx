import { OwnerItem } from '@/types/accessPolicies';

interface ApplicationCardProps {
    owner: OwnerItem;
    onClick: () => void;
}

export default function ApplicationCard({ owner, onClick }: ApplicationCardProps) {
    const isMcpOwner = owner.type === 'mcp';

    return (
        <button
            onClick={onClick}
            className="w-full text-left group transition-all duration-300 hover:scale-[1.01]"
        >
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-violet-50/30 to-cyan-50/20 shadow-md shadow-slate-200/60 transition-all duration-300 group-hover:border-violet-300 group-hover:shadow-lg group-hover:shadow-violet-200/40">
                <div className={`h-1.5 ${isMcpOwner ? 'bg-gradient-to-r from-violet-500 to-cyan-500' : 'bg-gradient-to-r from-cyan-500 to-emerald-500'}`}></div>

                <div className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-sm ${isMcpOwner ? 'bg-violet-100 text-violet-700' : 'bg-cyan-100 text-cyan-700'}`}>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
                                </svg>
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-bold text-lg text-slate-900 truncate" title={owner.name}>
                                    {owner.name}
                                </h3>
                                <p className="text-xs text-slate-500 truncate" title={owner.url}>
                                    {owner.url}
                                </p>
                            </div>
                        </div>
                        <span className={`text-[11px] px-2.5 py-1 rounded-full uppercase font-semibold border ${isMcpOwner ? 'bg-violet-100 text-violet-700 border-violet-200' : 'bg-cyan-100 text-cyan-700 border-cyan-200'}`}>
                            {owner.type}
                        </span>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
                        <span className="text-sm text-slate-500">{isMcpOwner ? 'Tools' : 'Endpoints'}</span>
                        <span className={`text-sm font-bold ${isMcpOwner ? 'text-violet-700' : 'text-cyan-700'}`}>{owner.endpointCount}</span>
                    </div>

                    <div className="flex items-center justify-end">
                        <span className="text-xs font-semibold text-slate-500 group-hover:text-slate-700 transition-colors">
                            Open access settings
                        </span>
                    </div>
                </div>
            </div>
        </button>
    );
}
