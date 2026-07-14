import { auth } from './insforge';

export interface BillingLaunchContext {
    source: 'tallylink';
    insforgeUserId: string;
    email: string;
    companyId?: string;
    companyName?: string;
    companyGstin?: string;
    createdAt: string;
}

export interface HandoffCreateResponse {
    handoffId: string;
    expiresAt?: string;
    deepLinkUrl?: string;
}

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.jls.billbook';
const BILLING_HANDOFF_PATH = '/api/handoff/create';

const emitLog = (level: 'info' | 'warn' | 'error', event: string, payload: Record<string, unknown> = {}) => {
    const entry = {
        level,
        event,
        payload,
        createdAt: new Date().toISOString(),
    };

    if (level === 'error') {
        console.error('[JLSBridge]', entry);
        return;
    }

    if (level === 'warn') {
        console.warn('[JLSBridge]', entry);
        return;
    }

    console.log('[JLSBridge]', entry);
};

const readResponseMessage = async (response: Response): Promise<string> => {
    const contentType = response.headers.get('content-type') || '';
    const raw = await response.text();

    if (!raw) {
        return '';
    }

    if (contentType.includes('application/json')) {
        try {
            const payload = JSON.parse(raw);
            return String(payload?.error || payload?.message || '').trim();
        } catch {
            return raw.trim();
        }
    }

    return raw.trim();
};

export const buildBillingLaunchContext = async (selectedCompany?: {
    id?: string;
    name?: string;
    gstin?: string;
    gst?: string;
} | null): Promise<BillingLaunchContext> => {
    const { data } = await auth.getCurrentSession();
    const session = data?.session || null;
    const user = session?.user || null;

    if (!user?.id || !(session?.accessToken || session?.access_token)) {
        emitLog('error', 'billing_handoff_missing_session');
        throw new Error('No active InsForge session found. Please sign in again.');
    }

    return {
        source: 'tallylink',
        insforgeUserId: user.id,
        email: user.email || '',
        companyId: selectedCompany?.id,
        companyName: selectedCompany?.name,
        companyGstin: selectedCompany?.gstin || selectedCompany?.gst,
        createdAt: new Date().toISOString(),
    };
};

export const createBillingHandoff = async (selectedCompany?: {
    id?: string;
    name?: string;
    gstin?: string;
    gst?: string;
} | null): Promise<HandoffCreateResponse> => {
    const { data } = await auth.getCurrentSession();
    const session = data?.session || null;
    const accessToken = session?.accessToken || session?.access_token;

    if (!accessToken) {
        emitLog('error', 'billing_handoff_missing_access_token');
        throw new Error('Billing handoff requires an active session.');
    }

    const context = await buildBillingLaunchContext(selectedCompany);
    const response = await fetch(BILLING_HANDOFF_PATH, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ context }),
    });

    if (!response.ok) {
        const errorText = await readResponseMessage(response);
        emitLog('error', 'billing_handoff_create_failed', { status: response.status, errorText });
        throw new Error(errorText || `Failed to prepare billing handoff (${response.status}).`);
    }

    const payload = await response.json() as HandoffCreateResponse;
    emitLog('info', 'billing_handoff_created', {
        handoffId: payload.handoffId,
        companyId: context.companyId,
    });
    return payload;
};

export const buildBillingDeepLink = (handoffId: string) => `com.jls.billbook://handoff/billing?handoffId=${encodeURIComponent(handoffId)}`;

export const attemptOpenJlsBilling = async (handoffId: string) => {
    const deepLink = buildBillingDeepLink(handoffId);
    let hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const onVisibilityChange = () => {
        hidden = document.visibilityState === 'hidden';
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.location.assign(deepLink);
    await new Promise((resolve) => window.setTimeout(resolve, 1800));
    document.removeEventListener('visibilitychange', onVisibilityChange);

    emitLog(hidden ? 'info' : 'warn', hidden ? 'billing_launch_opened' : 'billing_launch_not_confirmed', {
        handoffId,
        deepLink,
    });

    return { deepLink, opened: hidden };
};

export const openBillingPlayStore = () => {
    emitLog('info', 'billing_launch_play_store_opened');
    window.location.assign(PLAY_STORE_URL);
};