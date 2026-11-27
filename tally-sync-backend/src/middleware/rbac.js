const { supabaseIdentity } = require('../config/supabaseIdentity');
const logger = require('../utils/logger');

const ADMIN_EMAIL = 'lovneetrathi@gmail.com';

const ALL_TRUE = {
    Vouchers: { View: true, Create: true, Edit: true, Delete: true, Approve: true },
    Ledgers: { View: true, Create: true, Edit: true, Delete: true },
    Reports: { View: true, Export: true, Share: true },
    Settings: { View: true, Edit: true, 'Manage Users': true },
    GST: { View: true, File: true, Export: true },
    Tally: { Sync: true, Configure: true },
    Stock: { View: true, Create: true, Edit: true, Delete: true },
    Billing: { View: true, Edit: true, Manage: true },
};

const DEFAULT_ROLE_PERMISSIONS = {
    owner: ALL_TRUE,
    super_admin: ALL_TRUE,
    admin: ALL_TRUE,
    manager: {
        Vouchers: { View: true, Create: true, Edit: true, Delete: false, Approve: true },
        Ledgers: { View: true, Create: true, Edit: true, Delete: false },
        Reports: { View: true, Export: true, Share: true },
        Settings: { View: true, Edit: false, 'Manage Users': false },
        GST: { View: true, File: false, Export: true },
        Tally: { Sync: true, Configure: false },
        Stock: { View: true, Create: true, Edit: true, Delete: false },
        Billing: { View: true, Edit: true, Manage: false },
    },
    accountant: {
        Vouchers: { View: true, Create: true, Edit: true, Delete: false, Approve: false },
        Ledgers: { View: true, Create: true, Edit: true, Delete: false },
        Reports: { View: true, Export: true, Share: false },
        Settings: { View: false, Edit: false, 'Manage Users': false },
        GST: { View: true, File: true, Export: true },
        Tally: { Sync: true, Configure: false },
        Stock: { View: true, Create: false, Edit: false, Delete: false },
        Billing: { View: true, Edit: false, Manage: false },
    },
    editor: {
        Vouchers: { View: true, Create: true, Edit: true, Delete: false, Approve: false },
        Ledgers: { View: true, Create: true, Edit: true, Delete: false },
        Reports: { View: true, Export: true, Share: false },
        Settings: { View: false, Edit: false, 'Manage Users': false },
        GST: { View: true, File: false, Export: true },
        Tally: { Sync: true, Configure: false },
        Stock: { View: true, Create: true, Edit: true, Delete: false },
        Billing: { View: true, Edit: false, Manage: false },
    },
    sales: {
        Vouchers: { View: true, Create: true, Edit: false, Delete: false, Approve: false },
        Ledgers: { View: true, Create: false, Edit: false, Delete: false },
        Reports: { View: true, Export: false, Share: false },
        Settings: { View: false, Edit: false, 'Manage Users': false },
        GST: { View: true, File: false, Export: false },
        Tally: { Sync: false, Configure: false },
        Stock: { View: true, Create: false, Edit: false, Delete: false },
        Billing: { View: true, Edit: false, Manage: false },
    },
    viewer: {
        Vouchers: { View: true, Create: false, Edit: false, Delete: false, Approve: false },
        Ledgers: { View: true, Create: false, Edit: false, Delete: false },
        Reports: { View: true, Export: false, Share: false },
        Settings: { View: false, Edit: false, 'Manage Users': false },
        GST: { View: true, File: false, Export: false },
        Tally: { Sync: false, Configure: false },
        Stock: { View: true, Create: false, Edit: false, Delete: false },
        Billing: { View: true, Edit: false, Manage: false },
    },
};

function normalizeRole(role) {
    return String(role || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
}

function hasPermissionInMatrix(permissions, category, action) {
    if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return false;
    return permissions?.[category]?.[action] === true;
}

async function isUserPlatformAdmin(db, user) {
    if (!user) return false;
    if (String(user.email || '').trim().toLowerCase() === ADMIN_EMAIL) {
        return true;
    }
    try {
        const { data } = await db
            .from('user_profiles')
            .select('is_admin')
            .eq('id', user.id)
            .maybeSingle();
        return data?.is_admin === true;
    } catch {
        return false;
    }
}

async function resolveUserCompanyAccess(db, user, companyId) {
    if (!db || !user || !companyId) {
        return { hasAccess: false, isAdmin: false, isOwner: false, role: 'none', status: 'none', permissions: {} };
    }

    const isAdmin = await isUserPlatformAdmin(db, user);
    const { data: company } = await db
        .from('companies')
        .select('id, owner_id')
        .eq('id', companyId)
        .maybeSingle();

    const isOwner = Boolean(company && company.owner_id === user.id);

    if (isAdmin) {
        return {
            hasAccess: true,
            isAdmin: true,
            isOwner,
            companyOwnerId: company?.owner_id || null,
            role: 'super_admin',
            status: 'active',
            permissions: ALL_TRUE,
        };
    }

    if (isOwner) {
        return {
            hasAccess: true,
            isAdmin: false,
            isOwner: true,
            companyOwnerId: company?.owner_id || null,
            role: 'owner',
            status: 'active',
            permissions: ALL_TRUE,
        };
    }

    const { data: membership, error: memberError } = await db
        .from('company_users')
        .select('role, status')
        .eq('company_id', companyId)
        .eq('user_id', user.id)
        .maybeSingle();

    if (memberError || !membership) {
        return {
            hasAccess: false,
            isAdmin: false,
            isOwner: false,
            companyOwnerId: company?.owner_id || null,
            role: 'none',
            status: 'none',
            permissions: {},
        };
    }

    const status = membership.status || 'active';
    const roleKey = normalizeRole(membership.role || 'viewer');

    if (status !== 'active') {
        return {
            hasAccess: false,
            isAdmin: false,
            isOwner: false,
            companyOwnerId: company?.owner_id || null,
            role: roleKey,
            status,
            permissions: {},
        };
    }

    let permissions = null;
    try {
        const { data: roleRows } = await db
            .from('user_roles')
            .select('name, display_name, permissions');
        const matched = (roleRows || []).find(
            (r) =>
                normalizeRole(r.name) === roleKey ||
                normalizeRole(r.display_name) === roleKey ||
                String(r.id) === String(membership.role)
        );
        if (matched?.permissions && typeof matched.permissions === 'object' && !Array.isArray(matched.permissions) && Object.keys(matched.permissions).length > 0) {
            permissions = matched.permissions;
        }
    } catch {
        // Fallback to canonical default role matrix
    }

    if (!permissions) {
        permissions = DEFAULT_ROLE_PERMISSIONS[roleKey] || {};
    }

    return {
        hasAccess: true,
        isAdmin: false,
        isOwner: false,
        companyOwnerId: company?.owner_id || null,
        role: roleKey,
        status: 'active',
        permissions,
    };
}

function defaultCompanyIdExtractor(req) {
    return req.params?.companyId || req.body?.companyId || req.query?.companyId || null;
}

function requireCompanyMember(getCompanyId = defaultCompanyIdExtractor) {
    return async (req, res, next) => {
        try {
            if (!supabaseIdentity) {
                return res.status(503).json({ success: false, error: 'Database client not configured' });
            }
            if (!req.user) {
                return res.status(401).json({ success: false, error: 'Unauthorized' });
            }
            const companyId = getCompanyId(req);
            if (!companyId) {
                return res.status(400).json({ success: false, error: 'companyId is required' });
            }
            const access = await resolveUserCompanyAccess(supabaseIdentity, req.user, companyId);
            if (!access.hasAccess) {
                return res.status(403).json({ success: false, error: 'Forbidden: No active access to this company' });
            }
            req.companyAccess = access;
            return next();
        } catch (error) {
            logger.error('requireCompanyMember error:', error);
            return res.status(500).json({ success: false, error: 'Failed to verify company access' });
        }
    };
}

function requireCompanyPermission(category, action, getCompanyId = defaultCompanyIdExtractor) {
    return async (req, res, next) => {
        try {
            if (!supabaseIdentity) {
                return res.status(503).json({ success: false, error: 'Database client not configured' });
            }
            if (!req.user) {
                return res.status(401).json({ success: false, error: 'Unauthorized' });
            }
            const companyId = getCompanyId(req);
            if (!companyId) {
                return res.status(400).json({ success: false, error: 'companyId is required' });
            }
            const access = await resolveUserCompanyAccess(supabaseIdentity, req.user, companyId);
            if (!access.hasAccess || (!access.isAdmin && !access.isOwner && !hasPermissionInMatrix(access.permissions, category, action))) {
                return res.status(403).json({
                    success: false,
                    error: `Forbidden: Missing ${category}:${action} permission`,
                });
            }
            req.companyAccess = access;
            return next();
        } catch (error) {
            logger.error('requireCompanyPermission error:', error);
            return res.status(500).json({ success: false, error: 'Failed to verify permissions' });
        }
    };
}

function requirePlatformAdmin() {
    return async (req, res, next) => {
        try {
            if (!supabaseIdentity) {
                return res.status(503).json({ success: false, error: 'Database client not configured' });
            }
            if (!req.user) {
                return res.status(401).json({ success: false, error: 'Unauthorized' });
            }
            const isAdmin = await isUserPlatformAdmin(supabaseIdentity, req.user);
            if (!isAdmin) {
                return res.status(403).json({ success: false, error: 'Forbidden: Platform admin required' });
            }
            return next();
        } catch (error) {
            logger.error('requirePlatformAdmin error:', error);
            return res.status(500).json({ success: false, error: 'Failed to verify admin access' });
        }
    };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function writeRbacAuditLog(db, entry) {
    try {
        const rawEntityId = entry.entityId ? String(entry.entityId) : null;
        const entityId = rawEntityId && UUID_RE.test(rawEntityId) ? rawEntityId : null;
        const details = rawEntityId && !entityId
            ? { ...(entry.details || {}), entity_ref: rawEntityId }
            : (entry.details || {});

        await db.from('activity_logs').insert({
            company_id: entry.companyId || null,
            user_id: entry.actorId || null,
            user_email: entry.actorEmail || null,
            action: entry.action,
            entity_type: entry.entityType || 'rbac',
            entity_id: entityId,
            entity_name: entry.entityName ? String(entry.entityName) : null,
            details,
            ip_address: entry.ipAddress || null,
            user_agent: entry.userAgent || null,
        });
    } catch (error) {
        logger.warn('Failed to write RBAC audit log:', error?.message || error);
    }
}

module.exports = {
    ALL_TRUE,
    DEFAULT_ROLE_PERMISSIONS,
    normalizeRole,
    hasPermissionInMatrix,
    isUserPlatformAdmin,
    resolveUserCompanyAccess,
    requireCompanyMember,
    requireCompanyPermission,
    requirePlatformAdmin,
    writeRbacAuditLog,
};
