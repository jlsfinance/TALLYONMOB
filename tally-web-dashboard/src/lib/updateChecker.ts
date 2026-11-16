import { APP_INFO } from '@/config/appInfo';

export interface UpdateInfo {
    available: boolean;
    latestVersion: string;
    currentVersion: string;
    downloadUrl: string;
    releaseNotes: string;
    publishedAt: string;
}

export interface SyncedCompany {
    connector_version?: string | null;
    last_sync_at?: string | null;
}

const parts = (version: string) =>
    version.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);

/** True when `version` is strictly older than `than` (numeric compare, "3.2.9" < "3.2.10"). */
export function isOlderVersion(version: string, than: string): boolean {
    const a = parts(version);
    const b = parts(than);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] || 0;
        const y = b[i] || 0;
        if (x !== y) return x < y;
    }
    return false;
}

/**
 * The connector stamps companies.connector_version on every finished sync, so the card
 * shows only to users whose last sync came from a build older than APP_INFO.pcVersion.
 * A sync without a version means a connector older than the first one that reports it,
 * so it counts as older too. A user with no completed sync has nothing to upgrade.
 */
export function checkForUpdate(companies: SyncedCompany[]): UpdateInfo | null {
    const synced = (companies || []).filter(c => c.last_sync_at);
    if (synced.length === 0) return null;

    const unknown = '0.0.0';
    const versions = synced.map(c =>
        c.connector_version ? String(c.connector_version).replace(/^v/i, '') : unknown);
    const oldest = versions.reduce((min, v) => (isOlderVersion(v, min) ? v : min), versions[0]);
    if (!isOlderVersion(oldest, APP_INFO.pcVersion)) return null;

    return {
        available: true,
        latestVersion: APP_INFO.pcVersion,
        currentVersion: oldest === unknown ? 'an older connector' : `v${oldest}`,
        downloadUrl: APP_INFO.pcDownloadUrl,
        releaseNotes: '',
        publishedAt: '',
    };
}
