import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { AccessMode, OwnerPolicy } from '@/types/accessPolicies';
import { useUpdateOwnerDefaultPolicy, useUpdateEndpointPolicy } from '@/hooks/useAccessPolicies';

interface AccessControlModalProps {
    isOpen: boolean;
    onClose: () => void;
    ownerId: string;
    policy: OwnerPolicy;
}

const ACCESS_MODES: { value: AccessMode; label: string }[] = [
    { value: 'allow', label: 'Allow' },
    { value: 'approval', label: 'Require Approval' },
    { value: 'deny', label: 'Deny' },
];

export default function AccessControlModal({ isOpen, onClose, ownerId, policy }: AccessControlModalProps) {
    const [activeTab, setActiveTab] = useState<'default' | 'endpoints'>('default');
    const isMcpOwner = ownerId.startsWith('mcp:');
    const endpointsTabLabel = isMcpOwner ? 'Tools' : 'Endpoints';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Access Control: ${ownerId}`}>
            <div className="flex border-b mb-4">
                <button
                    className={`px-4 py-2 text-sm font-medium ${activeTab === 'default' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    onClick={() => setActiveTab('default')}
                >
                    Default Policy
                </button>
                <button
                    className={`px-4 py-2 text-sm font-medium ${activeTab === 'endpoints' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    onClick={() => setActiveTab('endpoints')}
                >
                    {endpointsTabLabel} ({policy.endpointPolicies ? Object.keys(policy.endpointPolicies).length : 0})
                </button>
            </div>

            {activeTab === 'default' && (
                <DefaultPolicyForm ownerId={ownerId} policy={policy} />
            )}

            {activeTab === 'endpoints' && (
                <EndpointsList ownerId={ownerId} policy={policy} />
            )}
        </Modal>
    );
}

function DefaultPolicyForm({ ownerId, policy }: { ownerId: string; policy: OwnerPolicy }) {
    const mutation = useUpdateOwnerDefaultPolicy();

    // Local state for form, with safe defaults
    const defaultMode = policy.defaultPolicy?.mode || 'approval';
    const defaultUsers = policy.defaultPolicy?.allowed_users || [];
    const defaultGroups = policy.defaultPolicy?.allowed_groups || [];

    const [mode, setMode] = useState<AccessMode>(defaultMode);
    const [users, setUsers] = useState(defaultUsers.join(', '));
    const [groups, setGroups] = useState(defaultGroups.join(', '));

    const handleSave = () => {
        mutation.mutate({
            ownerId,
            mode,
            allowed_users: users.split(',').map(s => s.trim()).filter(Boolean),
            allowed_groups: groups.split(',').map(s => s.trim()).filter(Boolean),
        });
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700">Default Access Mode</label>
                <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as AccessMode)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                >
                    {ACCESS_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-500">Applies to all tools unless overridden.</p>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700">Allowed Users (emails)</label>
                <textarea
                    value={users}
                    onChange={(e) => setUsers(e.target.value)}
                    placeholder="user@example.com, another@example.com"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    rows={2}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700">Allowed Groups</label>
                <input
                    type="text"
                    value={groups}
                    onChange={(e) => setGroups(e.target.value)}
                    placeholder="admins, developers"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                />
            </div>

            <div className="pt-2">
                <Button onClick={handleSave} disabled={mutation.isPending}>
                    {mutation.isPending ? 'Saving...' : 'Save Default Policy'}
                </Button>
            </div>
        </div>
    );
}

function EndpointsList({ ownerId, policy }: { ownerId: string; policy: OwnerPolicy }) {
    const mutation = useUpdateEndpointPolicy();
    const [editingId, setEditingId] = useState<string | null>(null);
    const isMcpOwner = ownerId.startsWith('mcp:');

    const endpoints = Object.entries(policy.endpointPolicies || {});

    if (endpoints.length === 0) {
        return (
            <div className="text-gray-500 text-sm p-4">
                No {isMcpOwner ? 'tool' : 'endpoint'} policies configured.
            </div>
        );
    }

    const handleSaveEndpoint = (data: any) => {
        mutation.mutate({
            ownerId,
            endpointId: data.toolId,
            mode: data.mode,
            allowed_users: data.allowed_users,
            allowed_groups: data.allowed_groups
        });
        setEditingId(null);
    };

    return (
        <div className="space-y-4">
            {endpoints.map(([toolId, toolPolicy]) => {
                const isEditing = editingId === toolId;
                return (
                    <div key={toolId} className="border rounded-lg p-3 transition-colors hover:bg-slate-50">
                        <div className="flex justify-between items-center mb-2">
                            <span className="font-medium text-sm">{toolId}</span>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingId(isEditing ? null : toolId)}
                                className="text-xs"
                            >
                                {isEditing ? 'Cancel' : 'Edit'}
                            </Button>
                        </div>

                        {isEditing ? (
                            <EndpointForm
                                toolId={toolId}
                                initialPolicy={toolPolicy}
                                onSave={handleSaveEndpoint}
                                isSaving={mutation.isPending}
                            />
                        ) : (
                            <div className="text-xs text-slate-500">
                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${toolPolicy.mode === 'allow' ? 'bg-green-100 text-green-700' :
                                        toolPolicy.mode === 'deny' ? 'bg-red-100 text-red-700' :
                                            'bg-yellow-100 text-yellow-700'
                                    }`}>
                                    {toolPolicy.mode}
                                </span>
                                {(toolPolicy.allowed_users?.length || 0) > 0 && <span className="ml-2">Users: {toolPolicy.allowed_users?.length}</span>}
                                {(toolPolicy.allowed_groups?.length || 0) > 0 && <span className="ml-2">Groups: {toolPolicy.allowed_groups?.length}</span>}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function EndpointForm({ toolId, initialPolicy, onSave, isSaving }: any) {
    const [mode, setMode] = useState<AccessMode>(initialPolicy.mode);
    const [users, setUsers] = useState((initialPolicy.allowed_users || []).join(', '));
    const [groups, setGroups] = useState((initialPolicy.allowed_groups || []).join(', '));

    return (
        <div className="space-y-3 bg-white p-3 rounded border border-blue-100 animate-in fade-in zoom-in-95 duration-150">
            <div>
                <label className="block text-xs font-medium text-slate-700">Access Mode</label>
                <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as AccessMode)}
                    className="mt-1 block w-full rounded border-gray-300 text-sm p-1"
                >
                    {ACCESS_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-xs font-medium text-slate-700">Allowed Users</label>
                <textarea
                    value={users}
                    onChange={(e) => setUsers(e.target.value)}
                    className="mt-1 block w-full rounded border-gray-300 text-sm p-1"
                    rows={1}
                    placeholder="email, email..."
                />
            </div>
            <div>
                <label className="block text-xs font-medium text-slate-700">Allowed Groups</label>
                <input
                    type="text"
                    value={groups}
                    onChange={(e) => setGroups(e.target.value)}
                    className="mt-1 block w-full rounded border-gray-300 text-sm p-1"
                    placeholder="group1, group2"
                />
            </div>
            <div className="flex justify-end pt-2">
                <Button size="sm" onClick={() => onSave({
                    toolId,
                    mode,
                    allowed_users: users.split(',').map((s: string) => s.trim()).filter(Boolean),
                    allowed_groups: groups.split(',').map((s: string) => s.trim()).filter(Boolean),
                })} disabled={isSaving}>
                    Save
                </Button>
            </div>
        </div>
    );
}
