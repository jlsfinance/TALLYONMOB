type MetadataRecord = Record<string, unknown> | null | undefined;

type UserLike = {
    email?: string | null;
    role?: string | null;
    app_metadata?: MetadataRecord;
    user_metadata?: MetadataRecord;
    metadata?: MetadataRecord;
} | null | undefined;

// The database must independently enforce this restriction through RLS.
const ADMIN_EMAIL = 'lovneetrathi@gmail.com';

export function isAdminConsoleEnabled(): boolean {
    return String(import.meta.env.VITE_ENABLE_ADMIN_CONSOLE || 'true').trim().toLowerCase() !== 'false';
}

export function hasAdminAccess(user: UserLike): boolean {
    return String(user?.email || '').trim().toLowerCase() === ADMIN_EMAIL;
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
