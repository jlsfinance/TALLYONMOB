export type PermissionMatrix = Record<string, Record<string, boolean>>;

export const PERMISSION_CATEGORIES: Record<string, string[]>;
export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionMatrix>;
export const SYSTEM_ROLES: { key: string; label: string; color: string; isSystem: boolean }[];

export function normalizeRoleKey(role: string | null | undefined): string;
export function getDefaultPermissionsForRole(role: string | null | undefined): PermissionMatrix;
export function parsePermissionKey(permission: string): { category: string; action: string } | null;
export function evaluatePermission(
    permissions: PermissionMatrix | null | undefined,
    role: string | null | undefined,
    permission: string,
    options?: { isAdmin?: boolean; isOwner?: boolean; status?: string }
): boolean;
export function canWriteCompany(
    permissions: PermissionMatrix | null | undefined,
    role: string | null | undefined,
    options?: { isAdmin?: boolean; isOwner?: boolean; status?: string }
): boolean;
