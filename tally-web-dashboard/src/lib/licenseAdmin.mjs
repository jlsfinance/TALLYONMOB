export async function applyLicenseAdminAction(client, { userId, action, days, reason, requestId }) {
    const { data, error } = await client.rpc('temporary_license_admin_action', {
        p_user_id: userId, p_action: action, p_days: action === 'REVOKE' ? null : days,
        p_reason: reason || null, p_request_id: requestId,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    const expectedStatus = action === 'REVOKE' ? 'REVOKED' : 'ACTIVE';
    if (result?.ok !== true || result.user_id !== userId || result.action !== action || result.status !== expectedStatus) {
        throw new Error(result?.message || 'The server did not confirm this license change. Refresh and check again.');
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('syncora-license-changed', { detail: { userId } }));
        if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('syncora-license-changes');
            channel.postMessage({ userId });
            channel.close();
        }
    }
    return result;
}
