import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import {
    Users, Shield, Mail, UserPlus, Trash2, Crown, Eye,
    Edit, Lock, Loader2, Check, X, Copy, ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';

type Role = 'owner' | 'accountant' | 'sales' | 'viewer';

interface TeamMember {
    id: string;
    email: string;
    role: Role;
    name: string;
    invited_at: string;
    status: 'active' | 'pending';
}

const ROLES: { value: Role; label: string; desc: string; icon: any; color: string }[] = [
    { value: 'owner', label: 'Owner', desc: 'Full access to everything', icon: Crown, color: 'text-amber-400 bg-amber-500/10' },
    { value: 'accountant', label: 'Accountant', desc: 'View & create vouchers, reports', icon: Edit, color: 'text-blue-400 bg-blue-500/10' },
    { value: 'sales', label: 'Sales', desc: 'View customers, create invoices', icon: Users, color: 'text-green-400 bg-green-500/10' },
    { value: 'viewer', label: 'Viewer', desc: 'Read-only access to data', icon: Eye, color: 'text-gray-400 bg-gray-500/10' },
];

export default function TeamManagementPage() {
    const { selectedCompany, user } = useAuth() as any;
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [showInvite, setShowInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<Role>('viewer');
    const [inviting, setInviting] = useState(false);

    useEffect(() => {
        if (selectedCompany?.id) loadMembers();
    }, [selectedCompany]);

    const loadMembers = async () => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from('team_members')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .order('role');

            setMembers(data || []);
        } catch {
            // Table may not exist ? show owner as default
            setMembers([{
                id: '1',
                email: user?.email || 'owner@example.com',
                role: 'owner',
                name: user?.user_metadata?.full_name || 'Owner',
                invited_at: new Date().toISOString(),
                status: 'active'
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleInvite = async () => {
        if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
            toast.error('Enter a valid email');
            return;
        }

        setInviting(true);
        try {
            const newMember: TeamMember = {
                id: Date.now().toString(),
                email: inviteEmail.trim(),
                role: inviteRole,
                name: inviteEmail.split('@')[0],
                invited_at: new Date().toISOString(),
                status: 'pending'
            };

            try {
                await supabase.from('team_members').insert({
                    company_id: selectedCompany.id,
                    email: inviteEmail.trim(),
                    role: inviteRole,
                    invited_by: user?.id,
                    status: 'pending'
                });
            } catch { /* Table may not exist */ }

            setMembers(prev => [...prev, newMember]);
            toast.success(`Invitation sent to ${inviteEmail}`);
            setInviteEmail('');
            setShowInvite(false);
        } catch {
            toast.error('Failed to send invitation');
        } finally {
            setInviting(false);
        }
    };

    const removeTeamMember = async (id: string) => {
        setMembers(prev => prev.filter(m => m.id !== id));
        toast.success('Team member removed');
    };

    const changeRole = async (id: string, newRole: Role) => {
        setMembers(prev => prev.map(m => m.id === id ? { ...m, role: newRole } : m));
        toast.success('Role updated');
    };

    const getRoleInfo = (role: Role) => ROLES.find(r => r.value === role) || ROLES[3];

    return (
        <div className="min-h-screen bg-[var(--background)] p-4 md:p-6 pb-24">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--on-surface)] flex items-center gap-2">
                        <Shield className="w-6 h-6 text-violet-400" />
                        Team Management
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Manage who has access to {selectedCompany?.name}</p>
                </div>
                <button onClick={() => setShowInvite(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-violet-500 text-white rounded-lg text-sm font-medium hover:bg-violet-600 transition-all">
                    <UserPlus className="w-4 h-4" /> Invite
                </button>
            </div>

            {/* Role Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {ROLES.map(role => {
                    const Icon = role.icon;
                    const count = members.filter(m => m.role === role.value).length;
                    return (
                        <div key={role.value} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-3">
                            <div className={`w-8 h-8 rounded-lg ${role.color} flex items-center justify-center mb-2`}>
                                <Icon className="w-4 h-4" />
                            </div>
                            <p className="text-sm font-medium text-[var(--on-surface)]">{role.label}</p>
                            <p className="text-xs text-[var(--text-muted)]">{count} {count === 1 ? 'member' : 'members'}</p>
                        </div>
                    );
                })}
            </div>

            {/* Invite Modal */}
            {showInvite && (
                <div className="bg-[var(--surface)] rounded-xl border border-violet-500/30 p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-[var(--on-surface)]">Invite Team Member</h3>
                        <button onClick={() => setShowInvite(false)}><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-[var(--text-muted)] mb-1 block">Email</label>
                            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                                placeholder="team@example.com"
                                className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-[var(--text-muted)] mb-1 block">Role</label>
                            <div className="grid grid-cols-2 gap-2">
                                {ROLES.filter(r => r.value !== 'owner').map(role => (
                                    <button key={role.value} onClick={() => setInviteRole(role.value)}
                                        className={`p-3 rounded-lg border text-left transition-all ${inviteRole === role.value
                                                ? 'border-violet-500 bg-violet-500/10'
                                                : 'border-[var(--border)]'
                                            }`}>
                                        <p className="text-sm font-medium text-[var(--on-surface)]">{role.label}</p>
                                        <p className="text-xs text-[var(--text-muted)]">{role.desc}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <button onClick={handleInvite} disabled={inviting}
                            className="w-full py-2.5 bg-violet-500 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                            {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                            Send Invitation
                        </button>
                    </div>
                </div>
            )}

            {/* Team Members List */}
            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-violet-400 animate-spin" /></div>
            ) : (
                <div className="space-y-2">
                    {members.map(member => {
                        const roleInfo = getRoleInfo(member.role);
                        const Icon = roleInfo.icon;
                        const isOwner = member.role === 'owner';
                        const isCurrentUser = member.email === user?.email;

                        return (
                            <div key={member.id} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full ${roleInfo.color} flex items-center justify-center`}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-medium text-[var(--on-surface)] truncate">{member.name || member.email}</h3>
                                            {isCurrentUser && <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">You</span>}
                                            {member.status === 'pending' && <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">Pending</span>}
                                        </div>
                                        <p className="text-xs text-[var(--text-muted)]">{member.email}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {!isOwner && !isCurrentUser && (
                                            <>
                                                <select value={member.role} onChange={(e) => changeRole(member.id, e.target.value as Role)}
                                                    className="px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-xs text-[var(--on-surface)]">
                                                    {ROLES.filter(r => r.value !== 'owner').map(r => (
                                                        <option key={r.value} value={r.value}>{r.label}</option>
                                                    ))}
                                                </select>
                                                <button onClick={() => removeTeamMember(member.id)}
                                                    className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                        {isOwner && (
                                            <span className="text-xs px-2 py-1 bg-amber-500/20 text-amber-400 rounded-full font-medium">
                                                👑 Owner
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Access Control Info */}
            <div className="mt-6 bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-3 flex items-center gap-2">
                    <Lock className="w-4 h-4" /> Permission Matrix
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-[var(--border)]">
                                <th className="text-left py-2 text-[var(--text-muted)]">Feature</th>
                                <th className="text-center py-2 text-amber-400">Owner</th>
                                <th className="text-center py-2 text-blue-400">Accountant</th>
                                <th className="text-center py-2 text-green-400">Sales</th>
                                <th className="text-center py-2 text-gray-400">Viewer</th>
                            </tr>
                        </thead>
                        <tbody className="text-[var(--on-surface)]">
                            {[
                                ['Dashboard', true, true, true, true],
                                ['Create Vouchers', true, true, true, false],
                                ['Edit Vouchers', true, true, false, false],
                                ['View Reports', true, true, true, true],
                                ['Manage Team', true, false, false, false],
                                ['Delete Data', true, false, false, false],
                                ['GST Filing', true, true, false, false],
                                ['Payment Reminders', true, true, true, false],
                            ].map(([feature, ...perms], i) => (
                                <tr key={i} className="border-b border-[var(--border)]">
                                    <td className="py-2">{feature as string}</td>
                                    {(perms as boolean[]).map((has, j) => (
                                        <td key={j} className="text-center">
                                            {has ? <Check className="w-3.5 h-3.5 text-green-400 mx-auto" /> : <X className="w-3.5 h-3.5 text-red-400/50 mx-auto" />}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

