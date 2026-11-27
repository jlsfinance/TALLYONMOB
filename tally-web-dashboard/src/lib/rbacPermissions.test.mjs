import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_ROLE_PERMISSIONS,
    evaluatePermission,
    parsePermissionKey,
} from './rbacPermissions.mjs';

test('parses colon and dot/snake permission keys accurately', () => {
    assert.deepEqual(parsePermissionKey('Vouchers:Edit'), { category: 'Vouchers', action: 'Edit' });
    assert.deepEqual(parsePermissionKey('vouchers.delete'), { category: 'Vouchers', action: 'Delete' });
    assert.deepEqual(parsePermissionKey('settings.manage_users'), { category: 'Settings', action: 'Manage Users' });
    assert.equal(parsePermissionKey('unknown.action'), null);
    assert.equal(parsePermissionKey('invalid'), null);
});

test('enforces Viewer as strictly read-only', () => {
    const perms = DEFAULT_ROLE_PERMISSIONS.viewer;
    assert.equal(evaluatePermission(perms, 'viewer', 'Vouchers:View', { status: 'active' }), true);
    assert.equal(evaluatePermission(perms, 'viewer', 'Reports:View', { status: 'active' }), true);
    assert.equal(evaluatePermission(perms, 'viewer', 'Vouchers:Create', { status: 'active' }), false);
    assert.equal(evaluatePermission(perms, 'viewer', 'Vouchers:Edit', { status: 'active' }), false);
    assert.equal(evaluatePermission(perms, 'viewer', 'Vouchers:Delete', { status: 'active' }), false);
    assert.equal(evaluatePermission(perms, 'viewer', 'Reports:Export', { status: 'active' }), false);
    assert.equal(evaluatePermission(perms, 'viewer', 'GST:Export', { status: 'active' }), false);
    assert.equal(evaluatePermission(perms, 'viewer', 'Settings:Manage Users', { status: 'active' }), false);
});

test('enforces Accountant create/edit/export without delete or manage users', () => {
    const perms = DEFAULT_ROLE_PERMISSIONS.accountant;
    assert.equal(evaluatePermission(perms, 'accountant', 'Vouchers:View', { status: 'active' }), true);
    assert.equal(evaluatePermission(perms, 'accountant', 'Vouchers:Create', { status: 'active' }), true);
    assert.equal(evaluatePermission(perms, 'accountant', 'Vouchers:Edit', { status: 'active' }), true);
    assert.equal(evaluatePermission(perms, 'accountant', 'Reports:Export', { status: 'active' }), true);
    assert.equal(evaluatePermission(perms, 'accountant', 'GST:File', { status: 'active' }), true);
    assert.equal(evaluatePermission(perms, 'accountant', 'GST:Export', { status: 'active' }), true);
    assert.equal(evaluatePermission(perms, 'accountant', 'Vouchers:Delete', { status: 'active' }), false);
    assert.equal(evaluatePermission(perms, 'accountant', 'Settings:Manage Users', { status: 'active' }), false);
});

test('enforces Owner and Platform Admin full access', () => {
    assert.equal(evaluatePermission({}, 'owner', 'Vouchers:Delete', { isOwner: true, status: 'active' }), true);
    assert.equal(evaluatePermission({}, 'viewer', 'Settings:Manage Users', { isAdmin: true, status: 'active' }), true);
});

test('blocks all permissions when membership is suspended or inactive', () => {
    const adminPerms = DEFAULT_ROLE_PERMISSIONS.admin;
    assert.equal(evaluatePermission(adminPerms, 'admin', 'Vouchers:View', { status: 'suspended' }), false);
    assert.equal(evaluatePermission(adminPerms, 'admin', 'Vouchers:Edit', { status: 'suspended' }), false);
    assert.equal(evaluatePermission(adminPerms, 'admin', 'Settings:Manage Users', { status: 'inactive' }), false);
});

test('honors custom database permission matrix overrides and fails closed on unknown keys', () => {
    const customTaxAuditor = {
        Vouchers: { View: true, Create: false, Edit: false, Delete: false, Approve: false },
        Reports: { View: true, Export: true, Share: false },
        GST: { View: true, File: true, Export: true },
    };
    assert.equal(evaluatePermission(customTaxAuditor, 'tax_auditor', 'Reports:Export', { status: 'active' }), true);
    assert.equal(evaluatePermission(customTaxAuditor, 'tax_auditor', 'GST:File', { status: 'active' }), true);
    assert.equal(evaluatePermission(customTaxAuditor, 'tax_auditor', 'Vouchers:Edit', { status: 'active' }), false);
    assert.equal(evaluatePermission(customTaxAuditor, 'tax_auditor', 'NonExistent:Perm', { status: 'active' }), false);
});
