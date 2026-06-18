const GITHUB_API = 'https://api.github.com/repos/jlsfinance/TALLYONMOB/releases/latest';
const CURRENT_VERSION = '2.10.9';

export interface UpdateInfo {
    available: boolean;
    latestVersion: string;
    currentVersion: string;
    downloadUrl: string;
    releaseNotes: string;
    publishedAt: string;
}

let cachedUpdate: UpdateInfo | null = null;
let lastCheck = 0;
const CHECK_INTERVAL = 60 * 60 * 1000;

export async function checkForUpdate(): Promise<UpdateInfo | null> {
    const now = Date.now();
    if (cachedUpdate && (now - lastCheck) < CHECK_INTERVAL) {
        return cachedUpdate;
    }

    try {
        const res = await fetch(GITHUB_API, {
            headers: { 'Accept': 'application/vnd.github.v3+json' },
        });
        if (!res.ok) return null;

        const data = await res.json();
        const tagName = data.tag_name || '';
        const latestVersion = tagName.replace(/^v/i, '');

        const pcAsset = data.assets?.find((a: any) => a.name?.endsWith('.exe'));
        const androidAsset = data.assets?.find((a: any) => a.name?.endsWith('.apk'));

        const downloadUrl = pcAsset?.browser_download_url || androidAsset?.browser_download_url || data.html_url;

        const available = latestVersion !== CURRENT_VERSION && latestVersion !== '';

        cachedUpdate = {
            available,
            latestVersion: latestVersion || CURRENT_VERSION,
            currentVersion: CURRENT_VERSION,
            downloadUrl,
            releaseNotes: data.body || '',
            publishedAt: data.published_at || '',
        };
        lastCheck = now;

        return cachedUpdate;
    } catch {
        return null;
    }
}

export function getCurrentVersion(): string {
    return CURRENT_VERSION;
}
