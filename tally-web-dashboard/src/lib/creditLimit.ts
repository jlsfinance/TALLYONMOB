const STORAGE_KEY = 'tallylink_credit_limits';

export function getCreditLimits(): Record<string, number> {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export function getCreditLimit(ledgerId: string): number {
    return getCreditLimits()[ledgerId] || 0;
}

export function setCreditLimit(ledgerId: string, limit: number) {
    const all = getCreditLimits();
    all[ledgerId] = limit;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function checkCreditLimit(ledgerId: string, currentBalance: number, newAmount: number): { ok: boolean; message: string } {
    const limit = getCreditLimit(ledgerId);
    if (limit <= 0) return { ok: true, message: '' };
    const projected = currentBalance + newAmount;
    if (projected > limit) {
        return {
            ok: false,
            message: `Credit limit exceeded! Limit: ₹${limit.toLocaleString('en-IN')}, Current: ₹${currentBalance.toLocaleString('en-IN')}, This invoice: ₹${newAmount.toLocaleString('en-IN')}`
        };
    }
    const remaining = limit - currentBalance;
    if (remaining < newAmount * 0.5) {
        return { ok: true, message: `⚠️ Credit limit warning: ₹${remaining.toLocaleString('en-IN')} remaining of ₹${limit.toLocaleString('en-IN')} limit` };
    }
    return { ok: true, message: '' };
}
