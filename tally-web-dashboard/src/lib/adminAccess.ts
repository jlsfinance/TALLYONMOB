type MetadataRecord = Record<string, unknown> | null | undefined;

type UserLike = {
    email?: string | null;
    role?: string | null;
    app_metadata?: MetadataRecord;
    user_metadata?: MetadataRecord;
    metadata?: MetadataRecord;
} | null | undefined;

const ADMIN_FLAG = String(import.meta.env.VITE_ENABLE_ADMIN_CONSOLE || '').trim().toLowerCase() === 'true';
const ADMIN_EMAILS = String(import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
const ADMIN_ROLES = new Set(['admin', 'super_admin']);

function readRole(metadata: MetadataRecord): string {
    return String(metadata?.role || metadata?.app_role || '').trim().toLowerCase();
}

function hasAllowedRole(value: string | null | undefined): boolean {
    return ADMIN_ROLES.has(String(value || '').trim().toLowerCase());
}

export function isAdminConsoleEnabled(): boolean {
    return ADMIN_FLAG;
}

export function hasAdminAccess(user: UserLike): boolean {
    if (!user) return false;

    // If admin console is enabled, allow any logged-in user
    if (ADMIN_FLAG) return true;

    const email = String(user.email || '').trim().toLowerCase();
    const directRole = String(user.role || '').trim().toLowerCase();
    const appRole = readRole(user.app_metadata);
    const userRole = readRole(user.user_metadata);
    const metadataRole = readRole(user.metadata);

    return (
        hasAllowedRole(directRole)
        || hasAllowedRole(appRole)
        || hasAllowedRole(userRole)
        || hasAllowedRole(metadataRole)
        || (email ? ADMIN_EMAILS.includes(email) : false)
    );
}

export function getAdminAccessMessage(user: UserLike): string {
    if (!isAdminConsoleEnabled()) {
        return 'Admin console is disabled in this environment.';
    }

    if (!user) {
        return 'Please sign in first.';
    }

    return 'This account is not allowlisted for admin access.';
}
