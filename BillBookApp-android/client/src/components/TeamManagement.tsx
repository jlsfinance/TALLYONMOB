/**
 * Team Management Component
 * Invite, manage, and remove team members with role-based access
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Users, UserPlus, Shield, ShieldCheck, Eye, Crown,
    Mail, Trash2, Clock, Check, AlertTriangle,
    RefreshCw
} from 'lucide-react';
import { teamService, TeamMember, TeamInvitation, UserRole } from '../services/teamService';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';

interface TeamManagementProps {
    isOpen: boolean;
    onClose: () => void;
}

const TeamManagement: React.FC<TeamManagementProps> = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const { company } = useCompany();

    const [members, setMembers] = useState<TeamMember[]>([]);
    const [pendingInvites, setPendingInvites] = useState<TeamInvitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'members' | 'invites'>('members');

    // Invite modal state
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<UserRole>('STAFF');
    const [inviting, setInviting] = useState(false);
    const [inviteError, setInviteError] = useState('');
    const [inviteSuccess, setInviteSuccess] = useState(false);

    // User's role
    const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);

    useEffect(() => {
        if (isOpen && company?.id && user?.uid) {
            loadTeamData();
            loadUserRole();
        }
    }, [isOpen, company?.id, user?.uid]);

    const loadTeamData = async () => {
        if (!company?.id) return;

        setLoading(true);
        try {
            const [teamMembers, invitations] = await Promise.all([
                teamService.getTeamMembers(company.id),
                teamService.getPendingInvitations(company.id),
            ]);
            setMembers(teamMembers);
            setPendingInvites(invitations);
        } catch (error) {
            console.error('Failed to load team data:', error);
        }
        setLoading(false);
    };

    const loadUserRole = async () => {
        if (!company?.id || !user?.uid) return;
        const { role } = await teamService.getUserRole(user.uid, company.id);
        setCurrentUserRole(role);
    };

    const handleInvite = async () => {
        if (!inviteEmail || !company?.id || !user) return;

        setInviting(true);
        setInviteError('');

        try {
            const result = await teamService.inviteMember({
                companyId: company.id,
                companyName: company.name || 'Company',
                email: inviteEmail,
                role: inviteRole,
                invitedBy: user.uid,
                invitedByName: user.displayName || user.email || 'User',
            });

            if (result.success) {
                setInviteSuccess(true);
                setInviteEmail('');
                loadTeamData();
                setTimeout(() => {
                    setInviteSuccess(false);
                    setShowInviteModal(false);
                }, 2000);
            } else {
                setInviteError(result.error || 'Failed to send invitation');
            }
        } catch (error: any) {
            setInviteError(error.message || 'Failed to send invitation');
        }
        setInviting(false);
    };

    const handleRemoveMember = async (memberId: string) => {
        if (!company?.id) return;

        if (confirm('Are you sure you want to remove this team member?')) {
            await teamService.removeMember(company.id, memberId);
            loadTeamData();
        }
    };

    const handleCancelInvite = async (inviteId: string) => {
        await teamService.cancelInvitation(inviteId);
        loadTeamData();
    };

    const handleRoleChange = async (memberId: string, newRole: UserRole) => {
        if (!company?.id) return;
        await teamService.updateMemberRole(company.id, memberId, newRole);
        loadTeamData();
    };

    const getRoleIcon = (role: UserRole) => {
        switch (role) {
            case 'OWNER':
                return <Crown className="w-4 h-4 text-yellow-500" />;
            case 'ADMIN':
                return <ShieldCheck className="w-4 h-4 text-blue-500" />;
            case 'STAFF':
                return <Shield className="w-4 h-4 text-emerald-500" />;
            case 'VIEWER':
                return <Eye className="w-4 h-4 text-slate-400" />;
        }
    };

    const getRoleBadgeColor = (role: UserRole) => {
        switch (role) {
            case 'OWNER':
                return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
            case 'ADMIN':
                return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
            case 'STAFF':
                return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
            case 'VIEWER':
                return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
        }
    };

    const canManageRole = (targetRole: UserRole): boolean => {
        if (!currentUserRole) return false;
        if (currentUserRole === 'OWNER') return true;
        if (currentUserRole === 'ADMIN' && targetRole !== 'OWNER' && targetRole !== 'ADMIN') return true;
        return false;
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl"
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                                    <Users className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black">Team Management</h2>
                                    <p className="text-sm opacity-80">
                                        {members.length} members • {pendingInvites.length} pending
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl bg-white/20 hover:bg-white/30 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={() => setActiveTab('members')}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'members'
                                    ? 'bg-white text-indigo-600'
                                    : 'bg-white/20 text-white'
                                    }`}
                            >
                                <Users className="w-4 h-4 inline mr-2" />
                                Members
                            </button>
                            <button
                                onClick={() => setActiveTab('invites')}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'invites'
                                    ? 'bg-white text-indigo-600'
                                    : 'bg-white/20 text-white'
                                    }`}
                            >
                                <Mail className="w-4 h-4 inline mr-2" />
                                Invites ({pendingInvites.length})
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="overflow-y-auto max-h-[calc(90vh-200px)] p-4">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
                            </div>
                        ) : activeTab === 'members' ? (
                            // Members List
                            <div className="space-y-3">
                                {members.length === 0 ? (
                                    <div className="text-center py-8">
                                        <Users className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                                        <p className="text-slate-500">No team members yet</p>
                                        <p className="text-sm text-slate-400">Invite your first team member below</p>
                                    </div>
                                ) : (
                                    members.map((member) => (
                                        <motion.div
                                            key={member.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4"
                                        >
                                            <div className="flex items-center gap-3">
                                                {/* Avatar */}
                                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                                                    {member.displayName?.charAt(0)?.toUpperCase() || 'U'}
                                                </div>

                                                {/* Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-slate-900 dark:text-white truncate">
                                                            {member.displayName}
                                                        </p>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${getRoleBadgeColor(member.role)}`}>
                                                            {getRoleIcon(member.role)}
                                                            {member.role}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 truncate">{member.email}</p>
                                                </div>

                                                {/* Actions */}
                                                {canManageRole(member.role) && member.role !== 'OWNER' && (
                                                    <button
                                                        onClick={() => handleRemoveMember(member.id)}
                                                        className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Role selector for manageable members */}
                                            {canManageRole(member.role) && member.role !== 'OWNER' && (
                                                <div className="mt-3 flex gap-2">
                                                    {(['ADMIN', 'STAFF', 'VIEWER'] as UserRole[]).map((role) => (
                                                        <button
                                                            key={role}
                                                            onClick={() => handleRoleChange(member.id, role)}
                                                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${member.role === role
                                                                ? getRoleBadgeColor(role)
                                                                : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                                                                }`}
                                                        >
                                                            {role}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </motion.div>
                                    ))
                                )}
                            </div>
                        ) : (
                            // Pending Invites
                            <div className="space-y-3">
                                {pendingInvites.length === 0 ? (
                                    <div className="text-center py-8">
                                        <Mail className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                                        <p className="text-slate-500">No pending invitations</p>
                                    </div>
                                ) : (
                                    pendingInvites.map((invite) => (
                                        <motion.div
                                            key={invite.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="bg-orange-50 dark:bg-orange-900/20 rounded-2xl p-4 border border-orange-200 dark:border-orange-800"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                                                    <Clock className="w-5 h-5 text-orange-500" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-slate-900 dark:text-white truncate">
                                                        {invite.email}
                                                    </p>
                                                    <p className="text-xs text-orange-600 dark:text-orange-400">
                                                        Invited as {invite.role} • Expires {new Date(invite.expiresAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleCancelInvite(invite.id)}
                                                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Invite Button */}
                    {(currentUserRole === 'OWNER' || currentUserRole === 'ADMIN') && (
                        <div className="p-4 border-t border-slate-100 dark:border-slate-800">
                            <button
                                onClick={() => setShowInviteModal(true)}
                                className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30"
                            >
                                <UserPlus className="w-5 h-5" />
                                Invite Team Member
                            </button>
                        </div>
                    )}
                </motion.div>

                {/* Invite Modal */}
                <AnimatePresence>
                    {showInviteModal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[210] bg-black/60 flex items-center justify-center p-4"
                            onClick={() => setShowInviteModal(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-6 shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                    <UserPlus className="w-5 h-5 text-indigo-500" />
                                    Invite Team Member
                                </h3>

                                {inviteSuccess ? (
                                    <div className="text-center py-8">
                                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                            <Check className="w-8 h-8 text-emerald-500" />
                                        </div>
                                        <p className="font-bold text-emerald-600 dark:text-emerald-400">Invitation Sent!</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Email Input */}
                                        <div className="mb-4">
                                            <label className="text-xs font-bold text-slate-500 mb-2 block">Email Address</label>
                                            <input
                                                type="email"
                                                value={inviteEmail}
                                                onChange={(e) => setInviteEmail(e.target.value)}
                                                placeholder="team@example.com"
                                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 focus:border-indigo-500 outline-none"
                                            />
                                        </div>

                                        {/* Role Selection */}
                                        <div className="mb-4">
                                            <label className="text-xs font-bold text-slate-500 mb-2 block">Role</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {(['ADMIN', 'STAFF', 'VIEWER'] as UserRole[]).map((role) => (
                                                    <button
                                                        key={role}
                                                        onClick={() => setInviteRole(role)}
                                                        className={`py-3 rounded-xl text-sm font-bold transition-all ${inviteRole === role
                                                            ? getRoleBadgeColor(role) + ' ring-2 ring-offset-2 ring-indigo-500'
                                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                                            }`}
                                                    >
                                                        {getRoleIcon(role)}
                                                        <span className="ml-1">{role}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-xs text-slate-500 mt-2">
                                                {teamService.getRoleDescription(inviteRole)}
                                            </p>
                                        </div>

                                        {inviteError && (
                                            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
                                                <AlertTriangle className="w-4 h-4" />
                                                {inviteError}
                                            </div>
                                        )}

                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setShowInviteModal(false)}
                                                className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleInvite}
                                                disabled={!inviteEmail || inviting}
                                                className="flex-1 py-3 bg-indigo-500 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                {inviting ? (
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <>
                                                        <Mail className="w-4 h-4" />
                                                        Send Invite
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </AnimatePresence>
    );
};

export default TeamManagement;
