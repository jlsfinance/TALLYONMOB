import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    Users, Shield, Mail, UserPlus, Trash2, Crown, Eye,
    Edit, Lock, Unlock, Loader2, Check, X, Send, Briefcase, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    DEFAULT_ROLE_PERMISSIONS,
    evaluatePermission,
    normalizeRoleKey,
} from '@/lib/rbacPermissions.mjs';
import {
    rbacService,
    type RbacRoleRecord,
} from '@/services/rbacService';

interface TeamRow {
    rowKey: string;
    userId?: string;
    invitationId?: string;
    isInvitation: boolean;
    isOwner: boolean;
    email: string;
    role: string;
    roleLabel: string;
    name: string;
    status: 'active' | 'invited' | 'suspended' | 'inactive';
}

const ROLE_CARD_META: { value: string; label: string; desc: string; icon: any; color: string }[] = [
    { value: 'owner', label: 'Company Owner', desc: 'Full control over this company', icon: Crown, color: 'text-amber-400 bg-amber-500/10' },
    { value: 'manager', label: 'Manager', desc: 'Vouchers, stock, reports & approvals', icon: Briefcase, color: 'text-yellow-400 bg-yellow-500/10' },
    { value: 'accountant', label: 'Accountant', desc: 'Vouchers, ledgers, GST & exports', icon: Edit, color: 'text-blue-400 bg-blue-500/10' },
    { value: 'sales', label: 'Sales', desc: 'View data and create invoices', icon: Users, color: 'text-green-400 bg-green-500/10' },
    { value: 'viewer', label: 'Viewer', desc: 'Read-only access to company data', icon: Eye, color: 'text-gray-400 bg-gray-500/10' },
];

const MATRIX_CHECKS: { label: string; category: string; action: string }[] = [
    { label: 'View Dashboard & Vouchers', category: 'Vouchers', action: 'View' },
    { label: 'Create Vouchers & Invoices', category: 'Vouchers', action: 'Create' },
    { label: 'Edit Vouchers', category: 'Vouchers', action: 'Edit' },
    { label: 'Delete Vouchers', category: 'Vouchers', action: 'Delete' },
    { label: 'Export Reports', category: 'Reports', action: 'Export' },
    { label: 'GST Filing & Export', category: 'GST', action: 'File' },
    { label: 'Tally Sync', category: 'Tally', action: 'Sync' },
    { label: 'Manage Team Users', category: 'Settings', action: 'Manage Users' },
];

export default function TeamManagementPage() {
    const { selectedCompany, user, can, isSuperAdmin } = useAuth() as any;
    const canManageTeam =
        typeof can === 'function'
            ? can('Settings:Manage Users')
            : Boolean(isSuperAdmin || (selectedCompany?.owner_id && selectedCompany.owner_id === user?.id));

    const [members, setMembers] = useState<TeamRow[]>([]);
    const [dbRoles, setDbRoles] = useState<RbacRoleRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [showInvite, setShowInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteName, setInviteName] = useState('');
    const [inviteRole, setInviteRole] = useState('viewer');
    const [inviting, setInviting] = useState(false);
    const [busyRow, setBusyRow] = useState<string | null>(null);

    const loadMembers = useCallback(async () => {
        if (!selectedCompany?.id) return;
        setLoading(true);
        setLoadError(null);
        try {
            const overview = await rbacService.getOverview(selectedCompany.id);

            const memberRows: TeamRow[] = overview.users.map((u) => {
                const membership =
                    u.memberships.find((m) => m.company_id === selectedCompany.id) || u.memberships[0];
                const roleKey = normalizeRoleKey(membership?.role || u.roleKey || 'viewer');
                const isOwner = Boolean(membership?.is_owner || roleKey === 'owner');
                return {
                    rowKey: `user:${u.id}`,
                    userId: u.id,
                    isInvitation: false,
                    isOwner,
                    email: u.email,
                    name: u.name || u.email,
                    role: roleKey,
                    roleLabel: isOwner ? 'Company Owner' : (membership?.role_label || u.role),
                    status: (membership?.status || u.status || 'active') as TeamRow['status'],
                };
            });

            const inviteRows: TeamRow[] = overview.invitations.map((inv) => ({
                rowKey: `inv:${inv.id}`,
                invitationId: inv.id,
                isInvitation: true,
                isOwner: false,
                email: inv.email,
                name: inv.full_name || inv.email,
                role: normalizeRoleKey(inv.role),
                roleLabel: inv.role_label || inv.role,
                status: 'invited',
            }));

            setMembers([...memberRows, ...inviteRows]);
            setDbRoles(overview.roles);
        } catch (err: any) {
            console.error('Team load error:', err);
            setLoadError(err?.message || 'Could not load company team members');
        } finally {
            setLoading(false);
        }
    }, [selectedCompany?.id]);

    useEffect(() => {
        if (selectedCompany?.id) {
            void loadMembers();
        }
    }, [selectedCompany?.id, loadMembers]);

    // Company staff roles ONLY — never assign platform 'admin' / 'super_admin' or 'owner' from Team Management
    const assignableRoles = useMemo(() => {
        const systemStaff = ROLE_CARD_META.filter((r) => r.value !== 'owner').map((r) => ({
            value: r.value,
            label: r.label,
            desc: r.desc,
        }));
        const customRoles = dbRoles
            .filter((r) => !r.is_system && !['owner', 'admin', 'super_admin'].includes(normalizeRoleKey(r.name)))
            .map((r) => ({
                value: r.name,
                label: r.display_name || r.name,
                desc: r.description || 'Custom role',
            }));
        return [...systemStaff, ...customRoles];
    }, [dbRoles]);

    const handleInvite = async () => {
        if (!selectedCompany?.id) return;
        if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
            toast.error('Enter a valid email');
            return;
        }

        setInviting(true);
        try {
            const res = await rbacService.inviteMember({
                companyIds: [selectedCompany.id],
                email: inviteEmail.trim(),
                role: inviteRole,
                fullName: inviteName.trim() || undefined,
            });
            await loadMembers();
            if (res.status === 'added') {
                toast.success(`${res.email} added to ${selectedCompany.name}`);
            } else if (res.emailSent) {
                toast.success(`Invitation email sent to ${res.email}`);
            } else {
                toast(
                    `Pending invitation saved for ${res.email}, but email was not sent (${res.emailError || 'mail delivery unavailable'}). Share the signup link manually.`,
                    { icon: '⚠️', duration: 6000 }
                );
            }
            setInviteEmail('');
            setInviteName('');
            setShowInvite(false);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to send invitation');
        } finally {
            setInviting(false);
        }
    };

    const removeTeamMember = async (row: TeamRow) => {
        if (!selectedCompany?.id) return;
        setBusyRow(row.rowKey);
        try {
            await rbacService.removeMember({
                companyId: selectedCompany.id,
                userId: row.isInvitation ? null : row.userId,
                invitationId: row.isInvitation ? row.invitationId : null,
            });
            await loadMembers();
            toast.success(row.isInvitation ? 'Invitation revoked' : 'Team member removed');
        } catch (err: any) {
            toast.error(err?.message || 'Failed to remove team member');
        } finally {
            setBusyRow(null);
        }
    };

    const changeRole = async (row: TeamRow, newRole: string) => {
        if (!selectedCompany?.id || !row.userId) return;
        setBusyRow(row.rowKey);
        try {
            await rbacService.updateMemberRole(selectedCompany.id, row.userId, newRole);
            await loadMembers();
            toast.success('Role updated and persisted');
        } catch (err: any) {
            toast.error(err?.message || 'Failed to update role');
        } finally {
            setBusyRow(null);
        }
    };

    const toggleSuspend = async (row: TeamRow) => {
        if (!selectedCompany?.id || !row.userId) return;
        const nextStatus = row.status === 'suspended' ? 'active' : 'suspended';
        setBusyRow(row.rowKey);
        try {
            await rbacService.updateMemberStatus(selectedCompany.id, row.userId, nextStatus);
            await loadMembers();
            toast.success(nextStatus === 'suspended' ? 'Member suspended' : 'Member reactivated');
        } catch (err: any) {
            toast.error(err?.message || 'Failed to update member status');
        } finally {
            setBusyRow(null);
        }
    };

    const resendInvite = async (row: TeamRow) => {
        if (!row.invitationId) return;
        setBusyRow(row.rowKey);
        try {
            await rbacService.resendInvitation(row.invitationId);
            await loadMembers();
            toast.success(`Invitation email resent to ${row.email}`);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to resend invitation email');
        } finally {
            setBusyRow(null);
        }
    };

    const getRoleInfo = (role: string) =>
        ROLE_CARD_META.find((r) => r.value === normalizeRoleKey(role)) || ROLE_CARD_META[4];

    const matrixRoles = ['owner', 'manager', 'accountant', 'sales', 'viewer'];
    const getRoleMatrix = (roleKey: string) => {
        const dbMatch = dbRoles.find((r) => normalizeRoleKey(r.name) === roleKey);
        if (dbMatch?.permissions && Object.keys(dbMatch.permissions).length > 0) {
            return dbMatch.permissions;
        }
        return (DEFAULT_ROLE_PERMISSIONS as any)[roleKey] || {};
    };

    return (
        <div className="min-h-screen bg-[var(--background)] p-4 md:p-6 pb-24">
            <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--on-surface)] flex items-center gap-2">
                        <Shield className="w-6 h-6 text-violet-400" />
                        Team Management
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Manage company members and access for {selectedCompany?.name}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => void loadMembers()}
                        className="p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface)] hover:bg-[var(--surface-variant)]"
                        title="Refresh team"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    {canManageTeam && (
                        <button
                            onClick={() => setShowInvite(true)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-violet-500 text-white rounded-lg text-sm font-medium hover:bg-violet-600 transition-all"
                        >
                            <UserPlus className="w-4 h-4" /> Invite
                        </button>
                    )}
                </div>
            </div>

            {loadError && (
                <div className="mb-4 p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-sm">
                    {loadError}
                </div>
            )}

            {/* Role Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                {ROLE_CARD_META.map(role => {
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
            {showInvite && canManageTeam && (
                <div className="bg-[var(--surface)] rounded-xl border border-violet-500/30 p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-[var(--on-surface)]">Invite Team Member</h3>
                        <button onClick={() => setShowInvite(false)}><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
                    </div>
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-[var(--text-muted)] mb-1 block">Full Name (Optional)</label>
                                <input
                                    type="text"
                                    value={inviteName}
                                    onChange={(e) => setInviteName(e.target.value)}
                                    placeholder="Staff name"
                                    className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-[var(--text-muted)] mb-1 block">Email *</label>
                                <input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="team@example.com"
                                    className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-[var(--text-muted)] mb-1 block">Company Role</label>
                            <div className="grid grid-cols-2 gap-2">
                                {assignableRoles.map(role => (
                                    <button
                                        key={role.value}
                                        type="button"
                                        onClick={() => setInviteRole(role.value)}
                                        className={`p-3 rounded-lg border text-left transition-all ${inviteRole === role.value
                                            ? 'border-violet-500 bg-violet-500/10'
                                            : 'border-[var(--border)]'
                                            }`}
                                    >
                                        <p className="text-sm font-medium text-[var(--on-surface)]">{role.label}</p>
                                        <p className="text-xs text-[var(--text-muted)]">{role.desc}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <button
                            onClick={() => void handleInvite()}
                            disabled={inviting}
                            className="w-full py-2.5 bg-violet-500 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                            Send Invitation
                        </button>
                    </div>
                </div>
            )}

            {/* Team Members List */}
            {loading && members.length === 0 ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-violet-400 animate-spin" /></div>
            ) : members.length === 0 ? (
                <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">
                    No team members found for this company yet.
                </div>
            ) : (
                <div className="space-y-2">
                    {members.map(member => {
                        const roleInfo = getRoleInfo(member.role);
                        const Icon = roleInfo.icon;
                        const isCurrentUser =
                            (member.userId && member.userId === user?.id) ||
                            member.email.toLowerCase() === String(user?.email || '').toLowerCase();
                        const rowBusy = busyRow === member.rowKey;

                        return (
                            <div key={member.rowKey} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full ${roleInfo.color} flex items-center justify-center shrink-0`}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-medium text-[var(--on-surface)] truncate">{member.name || member.email}</h3>
                                            {isCurrentUser && <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">You</span>}
                                            {member.status === 'invited' && <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">Pending Invite</span>}
                                            {member.status === 'suspended' && <span className="text-[10px] px-1.5 py-0.5 bg-rose-500/20 text-rose-400 rounded">Suspended</span>}
                                        </div>
                                        <p className="text-xs text-[var(--text-muted)] truncate">{member.email}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {!member.isOwner && !isCurrentUser && canManageTeam && (
                                            <>
                                                {member.isInvitation ? (
                                                    <button
                                                        disabled={rowBusy}
                                                        onClick={() => void resendInvite(member)}
                                                        className="p-1.5 text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-all disabled:opacity-50"
                                                        title="Resend Invitation"
                                                    >
                                                        <Send className="w-4 h-4" />
                                                    </button>
                                                ) : (
                                                    <>
                                                        <select
                                                            disabled={rowBusy}
                                                            value={member.role}
                                                            onChange={(e) => void changeRole(member, e.target.value)}
                                                            className="px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-xs text-[var(--on-surface)]"
                                                        >
                                                            {assignableRoles.map(r => (
                                                                <option key={r.value} value={r.value}>{r.label}</option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            disabled={rowBusy}
                                                            onClick={() => void toggleSuspend(member)}
                                                            className={`p-1.5 rounded-lg transition-all disabled:opacity-50 ${
                                                                member.status === 'suspended'
                                                                    ? 'text-emerald-400 hover:bg-emerald-500/10'
                                                                    : 'text-amber-400 hover:bg-amber-500/10'
                                                            }`}
                                                            title={member.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                                                        >
                                                            {member.status === 'suspended' ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    disabled={rowBusy}
                                                    onClick={() => void removeTeamMember(member)}
                                                    className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
                                                    title={member.isInvitation ? 'Revoke Invitation' : 'Remove Member'}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                        {!member.isOwner && (isCurrentUser || !canManageTeam) && (
                                            <span className="text-xs px-2 py-1 bg-gray-500/10 text-gray-400 rounded-full font-medium capitalize">
                                                {member.roleLabel}
                                            </span>
                                        )}
                                        {member.isOwner && (
                                            <span className="text-xs px-2 py-1 bg-amber-500/20 text-amber-400 rounded-full font-medium">
                                                Company Owner
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Dynamic Access Control Matrix */}
            <div className="mt-6 bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-3 flex items-center gap-2">
                    <Lock className="w-4 h-4" /> Live Role Permission Matrix
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-[var(--border)]">
                                <th className="text-left py-2 text-[var(--text-muted)]">Capability</th>
                                <th className="text-center py-2 text-amber-400">Owner</th>
                                <th className="text-center py-2 text-yellow-400">Manager</th>
                                <th className="text-center py-2 text-blue-400">Accountant</th>
                                <th className="text-center py-2 text-green-400">Sales</th>
                                <th className="text-center py-2 text-gray-400">Viewer</th>
                            </tr>
                        </thead>
                        <tbody className="text-[var(--on-surface)]">
                            {MATRIX_CHECKS.map((item, i) => (
                                <tr key={i} className="border-b border-[var(--border)]">
                                    <td className="py-2">{item.label}</td>
                                    {matrixRoles.map((rKey) => {
                                        const matrix = getRoleMatrix(rKey);
                                        const allowed = evaluatePermission(
                                            matrix,
                                            rKey,
                                            `${item.category}:${item.action}`,
                                            { isOwner: rKey === 'owner', status: 'active' }
                                        );
                                        return (
                                            <td key={rKey} className="text-center">
                                                {allowed ? (
                                                    <Check className="w-3.5 h-3.5 text-green-400 mx-auto" />
                                                ) : (
                                                    <X className="w-3.5 h-3.5 text-red-400/50 mx-auto" />
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
