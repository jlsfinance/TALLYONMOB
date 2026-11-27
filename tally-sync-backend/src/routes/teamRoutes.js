/**
 * Team & RBAC Routes - Authenticated, company-permission-enforced endpoints
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { supabaseIdentity } = require('../config/supabaseIdentity');
const { authenticate } = require('../middleware/auth');
const {
    DEFAULT_ROLE_PERMISSIONS,
    normalizeRole,
    isUserPlatformAdmin,
    resolveUserCompanyAccess,
    requireCompanyMember,
    requireCompanyPermission,
    requirePlatformAdmin,
    writeRbacAuditLog,
} = require('../middleware/rbac');
const { ROLES } = require('../config/constants');
const logger = require('../utils/logger');

const VALID_MEMBER_STATUSES = new Set(['active', 'suspended', 'inactive']);

function getDb(res) {
    if (!supabaseIdentity) {
        res.status(503).json({ success: false, error: 'Team service unavailable' });
        return null;
    }
    return supabaseIdentity;
}

async function isValidRole(db, roleKey) {
    if (Object.values(ROLES).includes(roleKey)) return true;
    const { data } = await db
        .from('user_roles')
        .select('name, display_name');
    return (data || []).some(
        (r) => normalizeRole(r.name) === roleKey || normalizeRole(r.display_name) === roleKey
    );
}

async function sendInviteEmailViaAuth(db, { email, fullName, companyId, role, redirectTo }) {
    if (typeof db?.auth?.admin?.inviteUserByEmail !== 'function') {
        return { emailSent: false, error: 'Auth invite mailer unavailable' };
    }
    try {
        const safeRedirect = redirectTo && (
            redirectTo.startsWith('https://') ||
            redirectTo.startsWith('http://localhost') ||
            redirectTo.startsWith('http://127.0.0.1')
        )
            ? redirectTo
            : 'https://tallyonmob.vercel.app/login';

        const { error } = await db.auth.admin.inviteUserByEmail(email, {
            redirectTo: safeRedirect,
            data: {
                full_name: fullName || '',
                invited_company_id: companyId,
                invited_role: role,
            },
        });
        if (error) {
            return { emailSent: false, error: error.message || 'Invite email delivery failed' };
        }
        return { emailSent: true, error: null };
    } catch (err) {
        return { emailSent: false, error: err?.message || 'Invite email delivery failed' };
    }
}

// Require verified JWT on every /api/v1/team route
router.use(authenticate);

// GET /team/roles - List role definitions
router.get('/roles', async (_req, res) => {
    const db = getDb(res);
    if (!db) return;

    try {
        const { data, error } = await db
            .from('user_roles')
            .select('*')
            .order('name');
        if (error) throw error;
        return res.json({ success: true, data: data || [] });
    } catch (error) {
        logger.error('GET /team/roles Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// POST /team/roles - Create custom role (Platform Admin only)
router.post('/roles', requirePlatformAdmin(), async (req, res) => {
    const db = getDb(res);
    if (!db) return;

    try {
        const displayName = String(req.body?.displayName || req.body?.name || '').trim();
        if (!displayName) {
            return res.status(400).json({ success: false, error: 'Role name is required' });
        }
        const slug = normalizeRole(displayName);
        const permissions = req.body?.permissions && typeof req.body.permissions === 'object'
            ? req.body.permissions
            : {};

        const { data, error } = await db
            .from('user_roles')
            .insert({
                name: slug,
                display_name: displayName,
                description: req.body?.description || '',
                permissions,
                is_system: false,
                color: req.body?.color || 'text-purple-400',
            })
            .select()
            .single();

        if (error) throw error;

        await writeRbacAuditLog(db, {
            actorId: req.user.id,
            actorEmail: req.user.email,
            action: 'rbac_role_created',
            entityType: 'rbac',
            entityId: data?.id,
            entityName: displayName,
            details: { name: slug },
        });

        return res.status(201).json({ success: true, data });
    } catch (error) {
        logger.error('POST /team/roles Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /team/roles/:roleId - Update role permissions (Platform Admin only)
router.put('/roles/:roleId', requirePlatformAdmin(), async (req, res) => {
    const db = getDb(res);
    if (!db) return;

    try {
        const updates = { updated_at: new Date().toISOString() };
        if (req.body?.displayName) updates.display_name = String(req.body.displayName).trim();
        if (req.body?.description !== undefined) updates.description = String(req.body.description);
        if (req.body?.permissions && typeof req.body.permissions === 'object') {
            updates.permissions = req.body.permissions;
        }

        const { data, error } = await db
            .from('user_roles')
            .update(updates)
            .eq('id', req.params.roleId)
            .select()
            .single();

        if (error) throw error;

        await writeRbacAuditLog(db, {
            actorId: req.user.id,
            actorEmail: req.user.email,
            action: 'rbac_role_updated',
            entityType: 'rbac',
            entityId: req.params.roleId,
            entityName: data?.display_name || data?.name || req.params.roleId,
            details: { permissions: updates.permissions },
        });

        return res.json({ success: true, data });
    } catch (error) {
        logger.error('PUT /team/roles/:roleId Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /team/roles/:roleId - Delete custom role (Platform Admin only)
router.delete('/roles/:roleId', requirePlatformAdmin(), async (req, res) => {
    const db = getDb(res);
    if (!db) return;

    try {
        const { data: roleRow, error: fetchErr } = await db
            .from('user_roles')
            .select('*')
            .eq('id', req.params.roleId)
            .single();
        if (fetchErr || !roleRow) {
            return res.status(404).json({ success: false, error: 'Role not found' });
        }
        if (roleRow.is_system) {
            return res.status(400).json({ success: false, error: 'System roles cannot be deleted' });
        }

        const { error } = await db
            .from('user_roles')
            .delete()
            .eq('id', req.params.roleId);
        if (error) throw error;

        await writeRbacAuditLog(db, {
            actorId: req.user.id,
            actorEmail: req.user.email,
            action: 'rbac_role_deleted',
            entityType: 'rbac',
            entityId: req.params.roleId,
            entityName: roleRow.display_name || roleRow.name,
        });

        return res.json({ success: true, message: 'Role deleted' });
    } catch (error) {
        logger.error('DELETE /team/roles/:roleId Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /team/permissions/:companyId - Caller's effective role & permissions for company
router.get('/permissions/:companyId', async (req, res) => {
    const db = getDb(res);
    if (!db) return;

    try {
        const access = await resolveUserCompanyAccess(db, req.user, req.params.companyId);
        return res.json({ success: true, data: access });
    } catch (error) {
        logger.error('GET /team/permissions Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /team/invitations/:companyId - Pending invitations (Manage Users only)
router.get(
    '/invitations/:companyId',
    requireCompanyPermission('Settings', 'Manage Users', (req) => req.params.companyId),
    async (req, res) => {
        const db = getDb(res);
        if (!db) return;

        try {
            const { data, error } = await db
                .from('team_invitations')
                .select('*')
                .eq('company_id', req.params.companyId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return res.json({ success: true, data: data || [] });
        } catch (error) {
            logger.error('GET /team/invitations Error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
);

// POST /team/invite - Invite or add a team member (Manage Users only; caller from req.user)
router.post(
    '/invite',
    requireCompanyPermission('Settings', 'Manage Users', (req) => req.body?.companyId),
    async (req, res) => {
        const db = getDb(res);
        if (!db) return;

        try {
            const companyId = req.body?.companyId;
            const email = String(req.body?.email || '').trim().toLowerCase();
            const fullName = req.body?.fullName ? String(req.body.fullName).trim() : null;
            const roleKey = normalizeRole(req.body?.role);

            if (!companyId || !email || !roleKey) {
                return res.status(400).json({ success: false, error: 'companyId, email, and role required' });
            }
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                return res.status(400).json({ success: false, error: 'Valid email is required' });
            }
            if (!(await isValidRole(db, roleKey))) {
                return res.status(400).json({ success: false, error: `Invalid role: ${roleKey}` });
            }
            if ((roleKey === 'owner' || roleKey === 'super_admin') && !req.companyAccess.isAdmin) {
                return res.status(403).json({ success: false, error: 'Only platform admin can assign owner or super_admin' });
            }

            const { data: existingUser } = await db
                .from('user_profiles')
                .select('id, email, full_name')
                .ilike('email', email)
                .maybeSingle();

            if (!existingUser) {
                const invitationId = crypto.randomUUID();
                const { error: invErr } = await db.from('team_invitations').insert({
                    id: invitationId,
                    company_id: companyId,
                    email,
                    full_name: fullName,
                    role: roleKey,
                    invited_by: req.user.id,
                    status: 'pending',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                });
                if (invErr) throw invErr;

                const delivery = await sendInviteEmailViaAuth(db, {
                    email,
                    fullName,
                    companyId,
                    role: roleKey,
                    redirectTo: req.body?.redirectTo,
                });

                await writeRbacAuditLog(db, {
                    companyId,
                    actorId: req.user.id,
                    actorEmail: req.user.email,
                    action: delivery.emailSent ? 'rbac_invite_email_sent' : 'rbac_user_invited',
                    entityType: 'rbac',
                    entityId: invitationId,
                    entityName: email,
                    details: {
                        role: roleKey,
                        mode: 'pending_invitation',
                        email_sent: delivery.emailSent,
                        ...(delivery.error ? { email_error: delivery.error } : {}),
                    },
                });

                return res.json({
                    success: true,
                    message: delivery.emailSent
                        ? `Invitation email sent to ${email}.`
                        : `Pending invitation saved for ${email}, but email was not sent (${delivery.error || 'mail delivery unavailable'}).`,
                    status: 'invited',
                    invitationId,
                    emailSent: delivery.emailSent,
                    emailError: delivery.error || undefined,
                });
            }

            const { error } = await db.from('company_users').upsert(
                {
                    company_id: companyId,
                    user_id: existingUser.id,
                    role: roleKey,
                    status: 'active',
                    can_sync: ['owner', 'admin', 'super_admin'].includes(roleKey),
                    invited_by: req.user.id,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'company_id,user_id' }
            );
            if (error) throw error;

            await writeRbacAuditLog(db, {
                companyId,
                actorId: req.user.id,
                actorEmail: req.user.email,
                action: 'rbac_user_invited',
                entityType: 'rbac',
                entityId: existingUser.id,
                entityName: email,
                details: { role: roleKey, mode: 'direct_add' },
            });

            return res.json({
                success: true,
                message: `${email} added as ${roleKey} successfully.`,
                status: 'added',
            });
        } catch (error) {
            logger.error('POST /team/invite Error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
);

// POST /team/invitations/:invitationId/resend - Resend invitation
router.post('/invitations/:invitationId/resend', async (req, res) => {
    const db = getDb(res);
    if (!db) return;

    try {
        const { data: inv, error: invErr } = await db
            .from('team_invitations')
            .select('*')
            .eq('id', req.params.invitationId)
            .maybeSingle();

        if (invErr || !inv || inv.status !== 'pending') {
            return res.status(404).json({ success: false, error: 'Pending invitation not found' });
        }

        const access = await resolveUserCompanyAccess(db, req.user, inv.company_id);
        const allowed = access.hasAccess && (access.isAdmin || access.isOwner || access.permissions?.Settings?.['Manage Users'] === true);
        if (!allowed) {
            return res.status(403).json({ success: false, error: 'Forbidden: Missing Settings:Manage Users permission' });
        }

        const delivery = await sendInviteEmailViaAuth(db, {
            email: inv.email,
            fullName: inv.full_name,
            companyId: inv.company_id,
            role: inv.role,
            redirectTo: req.body?.redirectTo,
        });

        if (!delivery.emailSent) {
            await writeRbacAuditLog(db, {
                companyId: inv.company_id,
                actorId: req.user.id,
                actorEmail: req.user.email,
                action: 'rbac_invite_email_failed',
                entityType: 'rbac',
                entityId: inv.id,
                entityName: inv.email,
                details: { role: inv.role, email_sent: false, error: delivery.error },
            });
            return res.status(502).json({
                success: false,
                emailSent: false,
                error: delivery.error || 'Email delivery unavailable',
            });
        }

        const { error: updErr } = await db
            .from('team_invitations')
            .update({ resent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', inv.id);
        if (updErr) throw updErr;

        await writeRbacAuditLog(db, {
            companyId: inv.company_id,
            actorId: req.user.id,
            actorEmail: req.user.email,
            action: 'rbac_invite_resent',
            entityType: 'rbac',
            entityId: inv.id,
            entityName: inv.email,
            details: { role: inv.role, email_sent: true },
        });

        return res.json({
            success: true,
            emailSent: true,
            message: `Invitation email resent to ${inv.email}`,
        });
    } catch (error) {
        logger.error('POST /team/invitations/:id/resend Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /team/role - Update team member role (Manage Users only)
router.put(
    '/role',
    requireCompanyPermission('Settings', 'Manage Users', (req) => req.body?.companyId),
    async (req, res) => {
        const db = getDb(res);
        if (!db) return;

        try {
            const { companyId, userId, role } = req.body || {};
            const roleKey = normalizeRole(role);

            if (!companyId || !userId || !roleKey) {
                return res.status(400).json({ success: false, error: 'companyId, userId, and role required' });
            }
            if (!(await isValidRole(db, roleKey))) {
                return res.status(400).json({ success: false, error: `Invalid role: ${roleKey}` });
            }
            if ((roleKey === 'owner' || roleKey === 'super_admin') && !req.companyAccess.isAdmin) {
                return res.status(403).json({ success: false, error: 'Only platform admin can assign owner or super_admin' });
            }
            if (req.companyAccess.companyOwnerId && req.companyAccess.companyOwnerId === userId && !req.companyAccess.isAdmin) {
                return res.status(403).json({ success: false, error: 'Cannot change company owner role' });
            }
            if (!req.companyAccess.isAdmin && await isUserPlatformAdmin(db, { id: userId })) {
                return res.status(403).json({ success: false, error: 'Cannot change platform super admin role' });
            }

            const { error } = await db
                .from('company_users')
                .update({
                    role: roleKey,
                    can_sync: ['owner', 'admin', 'super_admin'].includes(roleKey),
                    updated_at: new Date().toISOString(),
                })
                .eq('company_id', companyId)
                .eq('user_id', userId);

            if (error) throw error;

            await writeRbacAuditLog(db, {
                companyId,
                actorId: req.user.id,
                actorEmail: req.user.email,
                action: 'rbac_role_changed',
                entityType: 'rbac',
                entityId: userId,
                entityName: userId,
                details: { new_role: roleKey },
            });

            return res.json({ success: true, message: 'Role updated successfully', role: roleKey });
        } catch (error) {
            logger.error('PUT /team/role Error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
);

// PUT /team/status - Suspend or reactivate team member (Manage Users only)
router.put(
    '/status',
    requireCompanyPermission('Settings', 'Manage Users', (req) => req.body?.companyId),
    async (req, res) => {
        const db = getDb(res);
        if (!db) return;

        try {
            const { companyId, userId, status } = req.body || {};
            if (!companyId || !userId || !VALID_MEMBER_STATUSES.has(status)) {
                return res.status(400).json({ success: false, error: 'companyId, userId, and valid status required' });
            }
            if (userId === req.user.id && status !== 'active') {
                return res.status(400).json({ success: false, error: 'Cannot suspend your own membership' });
            }
            if (req.companyAccess.companyOwnerId && req.companyAccess.companyOwnerId === userId && status !== 'active') {
                return res.status(403).json({ success: false, error: 'Cannot suspend company owner' });
            }
            if (status !== 'active' && !req.companyAccess.isAdmin && await isUserPlatformAdmin(db, { id: userId })) {
                return res.status(403).json({ success: false, error: 'Cannot suspend platform super admin' });
            }

            const { error } = await db
                .from('company_users')
                .update({ status, updated_at: new Date().toISOString() })
                .eq('company_id', companyId)
                .eq('user_id', userId);

            if (error) throw error;

            await writeRbacAuditLog(db, {
                companyId,
                actorId: req.user.id,
                actorEmail: req.user.email,
                action: status === 'suspended' ? 'rbac_user_suspended' : 'rbac_user_unsuspended',
                entityType: 'rbac',
                entityId: userId,
                entityName: userId,
                details: { status },
            });

            return res.json({ success: true, message: 'Member status updated', status });
        } catch (error) {
            logger.error('PUT /team/status Error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
);

// DELETE /team/remove - Remove team member or revoke pending invitation (Manage Users only)
router.delete(
    '/remove',
    requireCompanyPermission('Settings', 'Manage Users', (req) => req.body?.companyId),
    async (req, res) => {
        const db = getDb(res);
        if (!db) return;

        try {
            const { companyId, userId, invitationId } = req.body || {};
            if (!companyId || (!userId && !invitationId)) {
                return res.status(400).json({ success: false, error: 'companyId and userId or invitationId required' });
            }

            if (invitationId) {
                const { error } = await db
                    .from('team_invitations')
                    .update({ status: 'revoked', updated_at: new Date().toISOString() })
                    .eq('company_id', companyId)
                    .eq('id', invitationId);
                if (error) throw error;

                await writeRbacAuditLog(db, {
                    companyId,
                    actorId: req.user.id,
                    actorEmail: req.user.email,
                    action: 'rbac_user_removed',
                    entityType: 'rbac',
                    entityId: invitationId,
                    entityName: invitationId,
                    details: { kind: 'invitation_revoked' },
                });
                return res.json({ success: true, message: 'Invitation revoked' });
            }

            if (userId === req.user.id) {
                return res.status(400).json({ success: false, error: 'Cannot remove your own membership' });
            }
            if (req.companyAccess.companyOwnerId && req.companyAccess.companyOwnerId === userId) {
                return res.status(403).json({ success: false, error: 'Cannot remove company owner' });
            }
            if (!req.companyAccess.isAdmin && await isUserPlatformAdmin(db, { id: userId })) {
                return res.status(403).json({ success: false, error: 'Cannot remove platform super admin' });
            }

            const { error } = await db
                .from('company_users')
                .delete()
                .eq('company_id', companyId)
                .eq('user_id', userId);
            if (error) throw error;

            await writeRbacAuditLog(db, {
                companyId,
                actorId: req.user.id,
                actorEmail: req.user.email,
                action: 'rbac_user_removed',
                entityType: 'rbac',
                entityId: userId,
                entityName: userId,
                details: { kind: 'member_removed' },
            });

            return res.json({ success: true, message: 'Team member removed' });
        } catch (error) {
            logger.error('DELETE /team/remove Error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
);

// POST /team/bulk - Bulk suspend / activate / remove (Manage Users only)
router.post(
    '/bulk',
    requireCompanyPermission('Settings', 'Manage Users', (req) => req.body?.companyId),
    async (req, res) => {
        const db = getDb(res);
        if (!db) return;

        try {
            const { companyId, userIds, action } = req.body || {};
            if (!companyId || !Array.isArray(userIds) || !['suspend', 'activate', 'remove'].includes(action)) {
                return res.status(400).json({ success: false, error: 'companyId, userIds[], and valid action required' });
            }

            const safeIds = [];
            for (const id of userIds) {
                if (!id || id === req.user.id || id === req.companyAccess.companyOwnerId) continue;
                if (!req.companyAccess.isAdmin && await isUserPlatformAdmin(db, { id })) continue;
                safeIds.push(id);
            }

            if (safeIds.length > 0) {
                if (action === 'remove') {
                    const { error } = await db
                        .from('company_users')
                        .delete()
                        .eq('company_id', companyId)
                        .in('user_id', safeIds);
                    if (error) throw error;
                } else {
                    const nextStatus = action === 'suspend' ? 'suspended' : 'active';
                    const { error } = await db
                        .from('company_users')
                        .update({ status: nextStatus, updated_at: new Date().toISOString() })
                        .eq('company_id', companyId)
                        .in('user_id', safeIds);
                    if (error) throw error;
                }
            }

            await writeRbacAuditLog(db, {
                companyId,
                actorId: req.user.id,
                actorEmail: req.user.email,
                action: 'rbac_bulk_action',
                entityType: 'rbac',
                entityId: companyId,
                entityName: action,
                details: { action, affected: safeIds.length },
            });

            return res.json({ success: true, affected: safeIds.length });
        } catch (error) {
            logger.error('POST /team/bulk Error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
);

// PUT /team/company-access - Grant or revoke company access (Manage Users only)
router.put(
    '/company-access',
    requireCompanyPermission('Settings', 'Manage Users', (req) => req.body?.companyId),
    async (req, res) => {
        const db = getDb(res);
        if (!db) return;

        try {
            const { companyId, userId, grant, role = 'viewer' } = req.body || {};
            if (!companyId || !userId || typeof grant !== 'boolean') {
                return res.status(400).json({ success: false, error: 'companyId, userId, and grant boolean required' });
            }
            if (!grant && req.companyAccess.companyOwnerId === userId) {
                return res.status(403).json({ success: false, error: 'Cannot revoke access from company owner' });
            }
            if (!grant && !req.companyAccess.isAdmin && await isUserPlatformAdmin(db, { id: userId })) {
                return res.status(403).json({ success: false, error: 'Cannot revoke access from platform super admin' });
            }

            if (grant) {
                let roleKey = normalizeRole(role || 'viewer');
                if ((roleKey === 'owner' || roleKey === 'super_admin') && !req.companyAccess.isAdmin) {
                    roleKey = 'viewer';
                }
                const { error } = await db.from('company_users').upsert(
                    {
                        company_id: companyId,
                        user_id: userId,
                        role: roleKey,
                        status: 'active',
                        invited_by: req.user.id,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'company_id,user_id' }
                );
                if (error) throw error;
            } else {
                const { error } = await db
                    .from('company_users')
                    .delete()
                    .eq('company_id', companyId)
                    .eq('user_id', userId);
                if (error) throw error;
            }

            await writeRbacAuditLog(db, {
                companyId,
                actorId: req.user.id,
                actorEmail: req.user.email,
                action: grant ? 'rbac_company_access_granted' : 'rbac_company_access_revoked',
                entityType: 'rbac',
                entityId: userId,
                entityName: companyId,
                details: { grant },
            });

            return res.json({ success: true, granted: grant });
        } catch (error) {
            logger.error('PUT /team/company-access Error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
);

// PUT /team/default-company - Set user's default company
router.put('/default-company', async (req, res) => {
    const db = getDb(res);
    if (!db) return;

    try {
        const companyId = req.body?.companyId;
        const targetUserId = req.body?.userId || req.user.id;
        if (!companyId) {
            return res.status(400).json({ success: false, error: 'companyId required' });
        }

        const access = await resolveUserCompanyAccess(db, req.user, companyId);
        const canManage = access.hasAccess && (access.isAdmin || access.isOwner || access.permissions?.Settings?.['Manage Users'] === true);
        if (targetUserId !== req.user.id && !canManage) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        await db
            .from('company_users')
            .update({ is_default: false, updated_at: new Date().toISOString() })
            .eq('user_id', targetUserId);

        const { error } = await db
            .from('company_users')
            .update({ is_default: true, updated_at: new Date().toISOString() })
            .eq('user_id', targetUserId)
            .eq('company_id', companyId);

        if (error) throw error;

        await writeRbacAuditLog(db, {
            companyId,
            actorId: req.user.id,
            actorEmail: req.user.email,
            action: 'rbac_default_company_changed',
            entityType: 'rbac',
            entityId: targetUserId,
            entityName: companyId,
        });

        return res.json({ success: true, defaultCompanyId: companyId });
    } catch (error) {
        logger.error('PUT /team/default-company Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /team/:companyId - Get active/suspended team members (Company member only)
router.get(
    '/:companyId',
    requireCompanyMember((req) => req.params.companyId),
    async (req, res) => {
        const db = getDb(res);
        if (!db) return;

        try {
            const { data, error } = await db
                .from('company_users')
                .select('*, user_profiles(email, full_name, is_active)')
                .eq('company_id', req.params.companyId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            return res.json({ success: true, data: data || [] });
        } catch (error) {
            logger.error('GET /team Error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
);

module.exports = router;
