export function licensePresentation(access, error, loading) {
    const active = !loading && !error && ['active', 'trial'].includes(access.status);
    const labels = { active: 'Active', trial: 'Trial', revoked: 'Revoked', suspended: 'Suspended', blocked: 'Blocked', expired: 'Expired', none: 'No license', unknown: 'Unverified' };
    return {
        active,
        label: loading ? 'Checking…' : error ? 'Verification unavailable' : labels[access.status] || 'Unverified',
        daysLeft: active ? Math.max(0, Number(access.daysLeft) || 0) : 0,
    };
}
