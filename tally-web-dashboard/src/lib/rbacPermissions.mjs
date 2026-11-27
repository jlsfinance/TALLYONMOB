/**
 * Shared RBAC permission matrix & evaluator (pure ESM for both browser and Node tests).
 */

export const PERMISSION_CATEGORIES = {
    Vouchers: ['View', 'Create', 'Edit', 'Delete', 'Approve'],
    Ledgers: ['View', 'Create', 'Edit', 'Delete'],
    Reports: ['View', 'Export', 'Share'],
    Settings: ['View', 'Edit', 'Manage Users'],
    GST: ['View', 'File', 'Export'],
    Tally: ['Sync', 'Configure'],
    Stock: ['View', 'Create', 'Edit', 'Delete'],
    Billing: ['View', 'Edit', 'Manage'],
};

const ALL_TRUE = Object.fromEntries(
    Object.entries(PERMISSION_CATEGORIES).map(([cat, actions]) => [
        cat,
        Object.fromEntries(actions.map((action) => [action, true])),
    ])
);

export const DEFAULT_ROLE_PERMISSIONS = {
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

export const SYSTEM_ROLES = [
    { key: 'owner', label: 'Owner', color: 'text-amber-400', isSystem: true },
    { key: 'super_admin', label: 'Super Admin', color: 'text-red-400', isSystem: true },
    { key: 'admin', label: 'Company Admin', color: 'text-orange-400', isSystem: true },
    { key: 'manager', label: 'Manager', color: 'text-yellow-400', isSystem: true },
    { key: 'accountant', label: 'Accountant', color: 'text-cyan-400', isSystem: true },
    { key: 'sales', label: 'Sales', color: 'text-emerald-400', isSystem: true },
    { key: 'viewer', label: 'Viewer', color: 'text-zinc-400', isSystem: true },
];

export function normalizeRoleKey(role) {
    const cleaned = String(role || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    if (cleaned === 'full_access') return 'admin';
    if (cleaned === 'sales_manager') return 'manager';
    return cleaned || 'viewer';
}

export function getDefaultPermissionsForRole(role) {
    const key = normalizeRoleKey(role);
    return DEFAULT_ROLE_PERMISSIONS[key] || {};
}

export function parsePermissionKey(permission) {
    const raw = String(permission || '').trim();
    if (!raw) return null;

    const parts = raw.includes(':') ? raw.split(':') : raw.split('.');
    if (parts.length !== 2) return null;

    const rawCategory = parts[0].trim().toLowerCase();
    const rawAction = parts[1].trim().toLowerCase().replace(/_/g, ' ');

    const matchedCategory = Object.keys(PERMISSION_CATEGORIES).find(
        (c) => c.toLowerCase() === rawCategory
    );
    if (!matchedCategory) return null;

    const matchedAction = PERMISSION_CATEGORIES[matchedCategory].find(
        (a) => a.toLowerCase() === rawAction
    );
    if (!matchedAction) return null;

    return { category: matchedCategory, action: matchedAction };
}

export function evaluatePermission(permissions, role, permission, options = {}) {
    if (options.isAdmin || options.isOwner) {
        return true;
    }

    if (options.status && options.status !== 'active') {
        return false;
    }

    const parsed = parsePermissionKey(permission);
    if (!parsed) {
        return false;
    }

    const hasExplicitMatrix =
        permissions &&
        typeof permissions === 'object' &&
        Object.keys(permissions).length > 0;

    const matrix = hasExplicitMatrix
        ? permissions
        : getDefaultPermissionsForRole(role);

    return matrix?.[parsed.category]?.[parsed.action] === true;
}

export function canWriteCompany(permissions, role, options = {}) {
    return (
        evaluatePermission(permissions, role, 'Vouchers:Create', options) ||
        evaluatePermission(permissions, role, 'Vouchers:Edit', options) ||
        evaluatePermission(permissions, role, 'Ledgers:Edit', options) ||
        evaluatePermission(permissions, role, 'Settings:Edit', options)
    );
}
