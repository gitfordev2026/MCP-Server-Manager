import { OwnerItem } from '@/types/accessPolicies';

interface ApplicationCardProps {
    owner: OwnerItem;
    onClick: () => void;
}

export default function ApplicationCard({ owner, onClick }: ApplicationCardProps) {
    return (
        <div
            onClick={onClick}
            className="bg-white border rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer flex flex-col gap-3"
        >
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg text-slate-800 truncate" title={owner.name}>
                    {owner.name}
                </h3>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full uppercase font-medium">
                    {owner.type}
                </span>
            </div>

            <div className="text-sm text-slate-500">
                <div className="flex justify-between">
                    <span>Endpoints:</span>
                    <span className="font-medium text-slate-700">{owner.endpointCount}</span>
                </div>
                <div className="truncate text-xs mt-1" title={owner.url}>
                    {owner.url}
                </div>
            </div>
        </div>
    );
}
