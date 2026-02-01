/**
 * usePermission Hook
 * Provides easy permission checking in React components
 */

import { useState, useEffect, useCallback } from 'react';
import { teamService, Permission, UserRole } from '../services/teamService';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';

interface UsePermissionResult {
    // Current role
    role: UserRole | null;
    loading: boolean;

    // Permission checks
    hasPermission: (permission: Permission) => boolean;
    hasAnyPermission: (permissions: Permission[]) => boolean;
    hasAllPermissions: (permissions: Permission[]) => boolean;

    // Role checks
    isOwner: boolean;
    isAdmin: boolean;
    isStaff: boolean;
    isViewer: boolean;
    canManageTeam: boolean;
    canEditSettings: boolean;

    // Reload
    refresh: () => Promise<void>;
}

export function usePermission(): UsePermissionResult {
    const { user } = useAuth();
    const { company } = useCompany();

    const [role, setRole] = useState<UserRole | null>(null);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(true);

    const loadPermissions = useCallback(async () => {
        if (!user?.uid || !company?.id) {
            setRole(null);
            setPermissions([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const result = await teamService.getUserRole(user.uid, company.id);
            setRole(result.role);
            setPermissions(result.permissions);
        } catch (error) {
            console.error('[usePermission] Failed to load permissions:', error);
            setRole(null);
            setPermissions([]);
        }
        setLoading(false);
    }, [user?.uid, company?.id]);

    useEffect(() => {
        loadPermissions();
    }, [loadPermissions]);

    // Permission check functions
    const hasPermission = useCallback((permission: Permission): boolean => {
        return permissions.includes(permission);
    }, [permissions]);

    const hasAnyPermission = useCallback((perms: Permission[]): boolean => {
        return perms.some(p => permissions.includes(p));
    }, [permissions]);

    const hasAllPermissions = useCallback((perms: Permission[]): boolean => {
        return perms.every(p => permissions.includes(p));
    }, [permissions]);

    return {
        role,
        loading,

        // Permission checks
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,

        // Role checks
        isOwner: role === 'OWNER',
        isAdmin: role === 'ADMIN',
        isStaff: role === 'STAFF',
        isViewer: role === 'VIEWER',
        canManageTeam: hasAnyPermission(['TEAM_MANAGE', 'TEAM_INVITE']),
        canEditSettings: hasPermission('SETTINGS_EDIT'),

        // Reload
        refresh: loadPermissions,
    };
}

/**
 * Higher Order Component for permission-based rendering
 */
interface WithPermissionProps {
    permission?: Permission;
    permissions?: Permission[];
    requireAll?: boolean;
    fallback?: React.ReactNode;
    children: React.ReactNode;
}

export function RequirePermission({
    permission,
    permissions,
    requireAll = false,
    fallback = null,
    children,
}: WithPermissionProps) {
    const { hasPermission, hasAnyPermission, hasAllPermissions, loading } = usePermission();

    if (loading) {
        return null;
    }

    // Single permission check
    if (permission) {
        if (!hasPermission(permission)) {
            return <>{ fallback } </>;
        }
    }

    // Multiple permissions check
    if (permissions && permissions.length > 0) {
        const hasAccess = requireAll
            ? hasAllPermissions(permissions)
            : hasAnyPermission(permissions);

        if (!hasAccess) {
            return <>{ fallback } </>;
        }
    }

    return <>{ children } </>;
}

/**
 * useCanAccess - Simple hook for checking single permission
 */
export function useCanAccess(permission: Permission): boolean {
    const { hasPermission, loading } = usePermission();

    if (loading) return false;
    return hasPermission(permission);
}

/**
 * Permission constants for common use cases
 */
export const PERMISSION_GROUPS = {
    // View permissions
    VIEW_ALL: [
        'INVOICE_VIEW',
        'CUSTOMER_VIEW',
        'INVENTORY_VIEW',
        'PAYMENT_VIEW',
        'REPORT_VIEW',
    ] as Permission[],

    // Create permissions
    CREATE_ALL: [
        'INVOICE_CREATE',
        'CUSTOMER_CREATE',
        'INVENTORY_CREATE',
        'PAYMENT_CREATE',
    ] as Permission[],

    // Edit permissions
    EDIT_ALL: [
        'INVOICE_EDIT',
        'CUSTOMER_EDIT',
        'INVENTORY_EDIT',
        'PAYMENT_EDIT',
    ] as Permission[],

    // Delete permissions
    DELETE_ALL: [
        'INVOICE_DELETE',
        'CUSTOMER_DELETE',
        'INVENTORY_DELETE',
        'PAYMENT_DELETE',
    ] as Permission[],

    // Admin permissions
    ADMIN: [
        'SETTINGS_VIEW',
        'SETTINGS_EDIT',
        'TEAM_VIEW',
        'TEAM_INVITE',
        'TEAM_MANAGE',
    ] as Permission[],
};

export default usePermission;
