/**
 * Team & User Roles Service
 * Manages multi-user access with Admin, Staff, and Viewer roles
 */

import {
    collection, doc, getDoc, setDoc, updateDoc, deleteDoc,
    query, where, getDocs, onSnapshot, arrayUnion, arrayRemove
} from 'firebase/firestore';

// Firebase db instance - will be imported from app's firebase config
let db: any;
try {
    // Dynamic import to avoid circular dependency
    const firebaseModule = require('../config/firebase');
    db = firebaseModule.db;
} catch {
    console.warn('[TeamService] Firebase not initialized yet');
}

// User Roles
export type UserRole = 'OWNER' | 'ADMIN' | 'STAFF' | 'VIEWER';

export interface TeamMember {
    id: string;
    userId: string;           // Firebase Auth UID
    email: string;
    displayName: string;
    photoURL?: string;
    role: UserRole;
    permissions: Permission[];
    status: 'ACTIVE' | 'INVITED' | 'DISABLED';
    invitedBy?: string;
    invitedAt?: string;
    joinedAt?: string;
    lastActiveAt?: string;
}

export interface TeamInvitation {
    id: string;
    companyId: string;
    companyName: string;
    email: string;
    role: UserRole;
    permissions: Permission[];
    invitedBy: string;
    invitedByName: string;
    invitedAt: string;
    expiresAt: string;
    status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
    token: string; // Unique invite token
}

// Granular Permissions
export type Permission =
    // Invoice permissions
    | 'INVOICE_VIEW'
    | 'INVOICE_CREATE'
    | 'INVOICE_EDIT'
    | 'INVOICE_DELETE'
    | 'INVOICE_SHARE'

    // Customer permissions
    | 'CUSTOMER_VIEW'
    | 'CUSTOMER_CREATE'
    | 'CUSTOMER_EDIT'
    | 'CUSTOMER_DELETE'

    // Inventory permissions
    | 'INVENTORY_VIEW'
    | 'INVENTORY_CREATE'
    | 'INVENTORY_EDIT'
    | 'INVENTORY_DELETE'

    // Payment permissions
    | 'PAYMENT_VIEW'
    | 'PAYMENT_CREATE'
    | 'PAYMENT_EDIT'
    | 'PAYMENT_DELETE'

    // Report permissions
    | 'REPORT_VIEW'
    | 'REPORT_EXPORT'

    // Settings permissions
    | 'SETTINGS_VIEW'
    | 'SETTINGS_EDIT'

    // Team permissions
    | 'TEAM_VIEW'
    | 'TEAM_INVITE'
    | 'TEAM_MANAGE'
    | 'TEAM_REMOVE';

// Default permissions for each role
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
    OWNER: [
        'INVOICE_VIEW', 'INVOICE_CREATE', 'INVOICE_EDIT', 'INVOICE_DELETE', 'INVOICE_SHARE',
        'CUSTOMER_VIEW', 'CUSTOMER_CREATE', 'CUSTOMER_EDIT', 'CUSTOMER_DELETE',
        'INVENTORY_VIEW', 'INVENTORY_CREATE', 'INVENTORY_EDIT', 'INVENTORY_DELETE',
        'PAYMENT_VIEW', 'PAYMENT_CREATE', 'PAYMENT_EDIT', 'PAYMENT_DELETE',
        'REPORT_VIEW', 'REPORT_EXPORT',
        'SETTINGS_VIEW', 'SETTINGS_EDIT',
        'TEAM_VIEW', 'TEAM_INVITE', 'TEAM_MANAGE', 'TEAM_REMOVE',
    ],
    ADMIN: [
        'INVOICE_VIEW', 'INVOICE_CREATE', 'INVOICE_EDIT', 'INVOICE_DELETE', 'INVOICE_SHARE',
        'CUSTOMER_VIEW', 'CUSTOMER_CREATE', 'CUSTOMER_EDIT', 'CUSTOMER_DELETE',
        'INVENTORY_VIEW', 'INVENTORY_CREATE', 'INVENTORY_EDIT', 'INVENTORY_DELETE',
        'PAYMENT_VIEW', 'PAYMENT_CREATE', 'PAYMENT_EDIT', 'PAYMENT_DELETE',
        'REPORT_VIEW', 'REPORT_EXPORT',
        'SETTINGS_VIEW',
        'TEAM_VIEW', 'TEAM_INVITE',
    ],
    STAFF: [
        'INVOICE_VIEW', 'INVOICE_CREATE', 'INVOICE_EDIT', 'INVOICE_SHARE',
        'CUSTOMER_VIEW', 'CUSTOMER_CREATE', 'CUSTOMER_EDIT',
        'INVENTORY_VIEW', 'INVENTORY_EDIT',
        'PAYMENT_VIEW', 'PAYMENT_CREATE',
        'REPORT_VIEW',
    ],
    VIEWER: [
        'INVOICE_VIEW',
        'CUSTOMER_VIEW',
        'INVENTORY_VIEW',
        'PAYMENT_VIEW',
        'REPORT_VIEW',
    ],
};

// Role display names
export const ROLE_DISPLAY_NAMES: Record<UserRole, { en: string; hi: string }> = {
    OWNER: { en: 'Owner', hi: 'मालिक' },
    ADMIN: { en: 'Admin', hi: 'एडमिन' },
    STAFF: { en: 'Staff', hi: 'स्टाफ' },
    VIEWER: { en: 'Viewer', hi: 'देखने वाला' },
};

// Role descriptions
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
    OWNER: 'Full access to everything. Can delete company.',
    ADMIN: 'Manage team, invoices, customers. Cannot delete company.',
    STAFF: 'Create/edit invoices and customers. Limited access.',
    VIEWER: 'View only. Cannot create or edit anything.',
};

class TeamService {

    private currentUserRole: UserRole | null = null;
    private currentPermissions: Permission[] = [];



    /**
     * Get current user's role and permissions for a company
     */
    async getUserRole(userId: string, companyId: string): Promise<{ role: UserRole | null; permissions: Permission[] }> {
        try {
            const memberRef = doc(db, 'companies', companyId, 'team', userId);
            const memberDoc = await getDoc(memberRef);

            if (memberDoc.exists()) {
                const data = memberDoc.data() as TeamMember;
                this.currentUserRole = data.role;
                this.currentPermissions = data.permissions || ROLE_PERMISSIONS[data.role];
                return { role: data.role, permissions: this.currentPermissions };
            }

            // Check if user is the company owner
            const companyRef = doc(db, 'companies', companyId);
            const companyDoc = await getDoc(companyRef);

            if (companyDoc.exists() && companyDoc.data().ownerId === userId) {
                this.currentUserRole = 'OWNER';
                this.currentPermissions = ROLE_PERMISSIONS.OWNER;
                return { role: 'OWNER', permissions: ROLE_PERMISSIONS.OWNER };
            }

            return { role: null, permissions: [] };
        } catch (error) {
            console.error('[TeamService] Failed to get user role:', error);
            return { role: null, permissions: [] };
        }
    }

    /**
     * Check if user has a specific permission
     */
    hasPermission(permission: Permission): boolean {
        return this.currentPermissions.includes(permission);
    }

    /**
     * Check if user has any of the given permissions
     */
    hasAnyPermission(permissions: Permission[]): boolean {
        return permissions.some(p => this.currentPermissions.includes(p));
    }

    /**
     * Get all team members for a company
     */
    async getTeamMembers(companyId: string): Promise<TeamMember[]> {
        try {
            const teamRef = collection(db, 'companies', companyId, 'team');
            const snapshot = await getDocs(teamRef);

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as TeamMember[];
        } catch (error) {
            console.error('[TeamService] Failed to get team members:', error);
            return [];
        }
    }

    /**
     * Subscribe to team members (real-time updates)
     */
    subscribeToTeam(companyId: string, callback: (members: TeamMember[]) => void): () => void {
        const teamRef = collection(db, 'companies', companyId, 'team');

        return onSnapshot(teamRef, (snapshot) => {
            const members = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as TeamMember[];
            callback(members);
        });
    }

    /**
     * Invite a new team member
     */
    async inviteMember(params: {
        companyId: string;
        companyName: string;
        email: string;
        role: UserRole;
        invitedBy: string;
        invitedByName: string;
        customPermissions?: Permission[];
    }): Promise<{ success: boolean; invitation?: TeamInvitation; error?: string }> {
        try {
            // Check if email is already invited or a member
            const existingInvite = await this.getInvitationByEmail(params.companyId, params.email);
            if (existingInvite && existingInvite.status === 'PENDING') {
                return { success: false, error: 'User already has a pending invitation' };
            }

            // Generate unique invite token
            const token = this.generateInviteToken();

            // Create invitation
            const inviteId = `${params.companyId}_${Date.now()}`;
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

            const invitation: TeamInvitation = {
                id: inviteId,
                companyId: params.companyId,
                companyName: params.companyName,
                email: params.email.toLowerCase(),
                role: params.role,
                permissions: params.customPermissions || ROLE_PERMISSIONS[params.role],
                invitedBy: params.invitedBy,
                invitedByName: params.invitedByName,
                invitedAt: new Date().toISOString(),
                expiresAt: expiresAt.toISOString(),
                status: 'PENDING',
                token,
            };

            // Save to Firestore
            await setDoc(doc(db, 'invitations', inviteId), invitation);

            console.log(`[TeamService] Invitation sent to ${params.email}`);
            return { success: true, invitation };
        } catch (error: any) {
            console.error('[TeamService] Failed to invite member:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Generate unique invite token
     */
    private generateInviteToken(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let token = '';
        for (let i = 0; i < 32; i++) {
            token += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return token;
    }

    /**
     * Get invitation by email
     */
    async getInvitationByEmail(companyId: string, email: string): Promise<TeamInvitation | null> {
        try {
            const invitesRef = collection(db, 'invitations');
            const q = query(
                invitesRef,
                where('companyId', '==', companyId),
                where('email', '==', email.toLowerCase()),
                where('status', '==', 'PENDING')
            );

            const snapshot = await getDocs(q);
            if (snapshot.empty) return null;

            return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as TeamInvitation;
        } catch (error) {
            console.error('[TeamService] Failed to get invitation:', error);
            return null;
        }
    }

    /**
     * Get all pending invitations for a user's email
     */
    async getUserInvitations(email: string): Promise<TeamInvitation[]> {
        try {
            const invitesRef = collection(db, 'invitations');
            const q = query(
                invitesRef,
                where('email', '==', email.toLowerCase()),
                where('status', '==', 'PENDING')
            );

            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as TeamInvitation[];
        } catch (error) {
            console.error('[TeamService] Failed to get user invitations:', error);
            return [];
        }
    }

    /**
     * Accept an invitation
     */
    async acceptInvitation(invitationId: string, userId: string, userEmail: string, userName: string, userPhoto?: string): Promise<boolean> {
        try {
            const inviteRef = doc(db, 'invitations', invitationId);
            const inviteDoc = await getDoc(inviteRef);

            if (!inviteDoc.exists()) {
                console.error('[TeamService] Invitation not found');
                return false;
            }

            const invitation = inviteDoc.data() as TeamInvitation;

            // Check if expired
            if (new Date(invitation.expiresAt) < new Date()) {
                await updateDoc(inviteRef, { status: 'EXPIRED' });
                console.error('[TeamService] Invitation expired');
                return false;
            }

            // Add user to team
            const memberData: TeamMember = {
                id: userId,
                userId: userId,
                email: userEmail,
                displayName: userName,
                photoURL: userPhoto,
                role: invitation.role,
                permissions: invitation.permissions,
                status: 'ACTIVE',
                invitedBy: invitation.invitedBy,
                invitedAt: invitation.invitedAt,
                joinedAt: new Date().toISOString(),
            };

            await setDoc(doc(db, 'companies', invitation.companyId, 'team', userId), memberData);

            // Update invitation status
            await updateDoc(inviteRef, { status: 'ACCEPTED' });

            // Add company to user's companies list
            await updateDoc(doc(db, 'users', userId), {
                companies: arrayUnion(invitation.companyId),
            });

            console.log(`[TeamService] User ${userEmail} joined ${invitation.companyName}`);
            return true;
        } catch (error) {
            console.error('[TeamService] Failed to accept invitation:', error);
            return false;
        }
    }

    /**
     * Decline an invitation
     */
    async declineInvitation(invitationId: string): Promise<boolean> {
        try {
            await updateDoc(doc(db, 'invitations', invitationId), {
                status: 'DECLINED',
            });
            return true;
        } catch (error) {
            console.error('[TeamService] Failed to decline invitation:', error);
            return false;
        }
    }

    /**
     * Update team member role
     */
    async updateMemberRole(companyId: string, memberId: string, newRole: UserRole, customPermissions?: Permission[]): Promise<boolean> {
        try {
            await updateDoc(doc(db, 'companies', companyId, 'team', memberId), {
                role: newRole,
                permissions: customPermissions || ROLE_PERMISSIONS[newRole],
            });
            return true;
        } catch (error) {
            console.error('[TeamService] Failed to update member role:', error);
            return false;
        }
    }

    /**
     * Remove team member
     */
    async removeMember(companyId: string, memberId: string): Promise<boolean> {
        try {
            await deleteDoc(doc(db, 'companies', companyId, 'team', memberId));

            // Remove company from user's list
            await updateDoc(doc(db, 'users', memberId), {
                companies: arrayRemove(companyId),
            });

            return true;
        } catch (error) {
            console.error('[TeamService] Failed to remove member:', error);
            return false;
        }
    }

    /**
     * Get pending invitations for a company
     */
    async getPendingInvitations(companyId: string): Promise<TeamInvitation[]> {
        try {
            const invitesRef = collection(db, 'invitations');
            const q = query(
                invitesRef,
                where('companyId', '==', companyId),
                where('status', '==', 'PENDING')
            );

            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as TeamInvitation[];
        } catch (error) {
            console.error('[TeamService] Failed to get pending invitations:', error);
            return [];
        }
    }

    /**
     * Cancel an invitation
     */
    async cancelInvitation(invitationId: string): Promise<boolean> {
        try {
            await deleteDoc(doc(db, 'invitations', invitationId));
            return true;
        } catch (error) {
            console.error('[TeamService] Failed to cancel invitation:', error);
            return false;
        }
    }

    /**
     * Get role display name
     */
    getRoleDisplayName(role: UserRole, language: 'en' | 'hi' = 'en'): string {
        return ROLE_DISPLAY_NAMES[role][language];
    }

    /**
     * Get role description
     */
    getRoleDescription(role: UserRole): string {
        return ROLE_DESCRIPTIONS[role];
    }

    /**
     * Get current user role
     */
    getCurrentRole(): UserRole | null {
        return this.currentUserRole;
    }

    /**
     * Get current permissions
     */
    getCurrentPermissions(): Permission[] {
        return this.currentPermissions;
    }
}

// Export singleton instance
export const teamService = new TeamService();
export default teamService;
