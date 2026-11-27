import { supabase } from '@/lib/insforge';

export interface RbacMembership {
    company_id: string;
    company_name: string;
    role: string;
    role_label: string;
    status: 'active' | 'suspended' | 'inactive';
    is_default: boolean;
    is_owner: boolean;
}

export interface RbacUserRecord {
    id: string;
    name: string;
    email: string;
    role: string;
    roleKey: string;
    status: 'active' | 'suspended' | 'inactive';
    lastLogin: string | null;
    lastActive: string | null;
    createdAt: string | null;
    memberships: RbacMembership[];
}

export interface RbacInvitationRecord {
    id: string;
    company_id: string;
    company_name: string;
    email: string;
    full_name: string;
    role: string;
    role_label: string;
    status: 'invited';
    resent_at: string | null;
    created_at: string;
}

export interface RbacRoleRecord {
    id: string;
    name: string;
    display_name: string;
    description: string;
    color: string;
    permissions: Record<string, Record<string, boolean>>;
    is_system: boolean;
    user_count: number;
}

export interface RbacCompanyRecord {
    id: string;
    name: string;
    owner_id: string | null;
    user_count: number;
}

export interface RbacLogRecord {
    id: string;
    company_id: string | null;
    user_id: string | null;
    user_email: string | null;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    entity_name: string | null;
    details: Record<string, any> | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
}

export interface RbacOverview {
    users: RbacUserRecord[];
    invitations: RbacInvitationRecord[];
    roles: RbacRoleRecord[];
    companies: RbacCompanyRecord[];
    logs: RbacLogRecord[];
}

function throwIfError(error: any, fallback: string): never {
    const message = error?.message || error?.details || error?.hint || fallback;
    throw new Error(message);
}

export const rbacService = {
    async getOverview(companyId: string | null = null): Promise<RbacOverview> {
        const { data, error } = await supabase.rpc('rbac_list_overview', {
            p_company_id: companyId,
        });
        if (error) throwIfError(error, 'Failed to load RBAC overview');
        return {
            users: Array.isArray(data?.users) ? data.users : [],
            invitations: Array.isArray(data?.invitations) ? data.invitations : [],
            roles: Array.isArray(data?.roles) ? data.roles : [],
            companies: Array.isArray(data?.companies) ? data.companies : [],
            logs: Array.isArray(data?.logs) ? data.logs : [],
        };
    },

    async inviteMember(params: {
        companyIds: string[];
        email: string;
        role: string;
        fullName?: string;
    }): Promise<{
        status: 'added' | 'invited';
        added_count: number;
        invited_count: number;
        invitation_id?: string | null;
        email: string;
        emailSent: boolean;
        emailError?: string;
    }> {
        const { data, error } = await supabase.rpc('rbac_invite_member', {
            p_company_ids: params.companyIds,
            p_email: params.email.trim(),
            p_role: params.role,
            p_full_name: params.fullName?.trim() || null,
        });
        if (error) throwIfError(error, 'Failed to invite team member');

        if (data?.status === 'invited' && data?.invitation_id) {
            const redirectTo = typeof window !== 'undefined'
                ? `${window.location.origin}/login`
                : 'https://tallyonmob.vercel.app/login';
            const { data: fnData, error: fnError } = await supabase.functions.invoke('rbac-send-invite', {
                body: {
                    invitationId: data.invitation_id,
                    redirectTo,
                    mode: 'invite',
                },
            });
            const emailSent = Boolean(fnData?.emailSent) && !fnError;
            const emailError = fnError?.message || (!emailSent ? (fnData?.error || 'Email delivery unavailable') : undefined);
            return {
                ...data,
                emailSent,
                emailError,
            };
        }

        return {
            ...data,
            emailSent: false,
        };
    },

    async resendInvitation(invitationId: string): Promise<{ success: boolean; email: string; emailSent: boolean }> {
        const redirectTo = typeof window !== 'undefined'
            ? `${window.location.origin}/login`
            : 'https://tallyonmob.vercel.app/login';
        const { data: fnData, error: fnError } = await supabase.functions.invoke('rbac-send-invite', {
            body: {
                invitationId,
                redirectTo,
                mode: 'resend',
            },
        });
        if (fnError) throwIfError(fnError, 'Invitation email could not be sent');
        if (!fnData?.emailSent) {
            throw new Error(fnData?.error || 'Invitation email could not be sent');
        }
        return {
            success: true,
            email: fnData.email || '',
            emailSent: true,
        };
    },

    async updateMemberRole(companyId: string, userId: string, role: string): Promise<void> {
        const { error } = await supabase.rpc('rbac_update_member_role', {
            p_company_id: companyId,
            p_user_id: userId,
            p_role: role,
        });
        if (error) throwIfError(error, 'Failed to update role');
    },

    async updateMemberStatus(
        companyId: string,
        userId: string,
        status: 'active' | 'suspended' | 'inactive'
    ): Promise<void> {
        const { error } = await supabase.rpc('rbac_update_member_status', {
            p_company_id: companyId,
            p_user_id: userId,
            p_status: status,
        });
        if (error) throwIfError(error, 'Failed to update member status');
    },

    async removeMember(params: {
        companyId: string;
        userId?: string | null;
        invitationId?: string | null;
    }): Promise<void> {
        const { error } = await supabase.rpc('rbac_remove_member', {
            p_company_id: params.companyId,
            p_user_id: params.userId || null,
            p_invitation_id: params.invitationId || null,
        });
        if (error) throwIfError(error, 'Failed to remove member');
    },

    async bulkMemberAction(
        companyId: string,
        userIds: string[],
        action: 'suspend' | 'activate' | 'remove'
    ): Promise<{ affected: number }> {
        const { data, error } = await supabase.rpc('rbac_bulk_member_action', {
            p_company_id: companyId,
            p_user_ids: userIds,
            p_action: action,
        });
        if (error) throwIfError(error, 'Bulk action failed');
        return { affected: Number(data?.affected || 0) };
    },

    async setCompanyAccess(
        userId: string,
        companyId: string,
        grant: boolean,
        role = 'viewer'
    ): Promise<void> {
        const { error } = await supabase.rpc('rbac_set_company_access', {
            p_user_id: userId,
            p_company_id: companyId,
            p_grant: grant,
            p_role: role,
        });
        if (error) throwIfError(error, 'Failed to update company access');
    },

    async setDefaultCompany(userId: string, companyId: string): Promise<void> {
        const { error } = await supabase.rpc('rbac_set_default_company', {
            p_user_id: userId,
            p_company_id: companyId,
        });
        if (error) throwIfError(error, 'Failed to set default company');
    },

    async saveRole(params: {
        roleId?: string | null;
        name?: string;
        displayName?: string;
        permissions: Record<string, Record<string, boolean>>;
        description?: string;
        color?: string;
    }): Promise<RbacRoleRecord> {
        const { data, error } = await supabase.rpc('rbac_save_role', {
            p_role_id: params.roleId || null,
            p_name: params.name || null,
            p_display_name: params.displayName || null,
            p_permissions: params.permissions,
            p_description: params.description || null,
            p_color: params.color || null,
        });
        if (error) throwIfError(error, 'Failed to save role');
        return data?.role;
    },

    async deleteRole(roleId: string): Promise<void> {
        const { error } = await supabase.rpc('rbac_delete_role', {
            p_role_id: roleId,
        });
        if (error) throwIfError(error, 'Failed to delete role');
    },
};
