import { useRef, useState } from 'react';
import { supabase } from '@/lib/insforge';
import { formatPlanPrice } from '@/config/subscriptionPlans';
import toast from 'react-hot-toast';

type CouponDraft = {
    id: string | null; code: string; discount_type: string; discount_value: string;
    min_order: string; max_discount: string; usage_limit: string; per_user_limit: string;
    expiry_date: string; applicable_plans: string[]; is_active: boolean; audience: string; emails: string;
};
const emptyDraft = (): CouponDraft => ({ id: null, code: '', discount_type: 'flat', discount_value: '',
    min_order: '0', max_discount: '', usage_limit: '', per_user_limit: '1', expiry_date: '',
    applicable_plans: [], is_active: true, audience: 'global', emails: '' });
const inputClass = 'mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-sm';
const localDateTime = (iso: string) => {
    const date = new Date(iso);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function AdminSubscriptionCoupons({ coupons, plans, reload }: { coupons: any[]; plans: any[]; reload: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [draft, setDraft] = useState<CouponDraft>(emptyDraft);
    const [saving, setSaving] = useState(false);
    const [opening, setOpening] = useState(false);
    const [error, setError] = useState('');

    const open = async (coupon?: any) => {
        setError('');
        setOpening(true);
        try {
            let emails = '';
            if (coupon?.audience === 'specific') {
                const { data, error: targetError } = await supabase.rpc('admin_get_coupon_target_emails', { p_coupon_id: coupon.id });
                if (targetError) throw targetError;
                emails = (data || []).map((row: any) => typeof row === 'string' ? row : row.email).filter(Boolean).join('\n');
            }
            setDraft(coupon ? {
                id: coupon.id, code: coupon.code, discount_type: coupon.discount_type,
                discount_value: String(coupon.discount_value), min_order: String(coupon.min_order ?? 0),
                max_discount: coupon.max_discount == null ? '' : String(coupon.max_discount),
                usage_limit: coupon.usage_limit == null ? '' : String(coupon.usage_limit),
                per_user_limit: String(coupon.per_user_limit ?? 1),
                expiry_date: coupon.expiry_date ? localDateTime(coupon.expiry_date) : '',
                applicable_plans: coupon.applicable_plans || [], is_active: coupon.is_active,
                audience: coupon.audience || 'global', emails,
            } : emptyDraft());
            dialog.current?.showModal();
        } catch { toast.error('Could not load coupon details. Please try again.'); }
        finally { setOpening(false); }
    };

    const save = async () => {
        setError('');
        const discount = Number(draft.discount_value);
        const optionalPositive = (value: string) => value === '' || (Number.isFinite(Number(value)) && Number(value) > 0);
        if (!/^[A-Z0-9_-]{1,80}$/.test(draft.code.trim().toUpperCase()) || !draft.discount_value.trim() || !Number.isFinite(discount) || discount <= 0 || (draft.discount_type === 'percentage' && discount > 100)
            || !Number.isFinite(Number(draft.min_order)) || Number(draft.min_order) < 0 || !optionalPositive(draft.max_discount)
            || ![draft.usage_limit, draft.per_user_limit].every(value => optionalPositive(value) && (value === '' || Number.isInteger(Number(value)))) || !draft.per_user_limit.trim()) {
            setError('Enter a valid code and discount. Limits must be positive whole numbers; minimum price cannot be negative.'); return;
        }
        const emails = draft.emails.split(/[\n,]+/).map(email => email.trim()).filter(Boolean);
        if (draft.audience === 'specific' && !emails.length) { setError('Enter at least one registered user email.'); return; }
        if (draft.expiry_date && !Number.isFinite(new Date(draft.expiry_date).getTime())) { setError('Enter a valid expiry date.'); return; }
        setSaving(true);
        try {
            const { error: saveError } = await supabase.rpc('admin_save_subscription_coupon', {
                p_coupon_id: draft.id, p_audience: draft.audience, p_emails: emails,
                p_settings: {
                    code: draft.code.trim().toUpperCase(), discount_type: draft.discount_type, discount_value: discount,
                    min_order: Number(draft.min_order), max_discount: draft.max_discount === '' ? null : Number(draft.max_discount),
                    usage_limit: draft.usage_limit === '' ? null : Number(draft.usage_limit), per_user_limit: Number(draft.per_user_limit),
                    expiry_date: draft.expiry_date ? new Date(draft.expiry_date).toISOString() : null,
                    applicable_plans: draft.applicable_plans, is_active: draft.is_active,
                },
            });
            if (saveError) throw saveError;
            dialog.current?.close();
            toast.success('Coupon saved');
            reload();
        } catch (cause: any) { setError(cause.message || 'Coupon could not be saved.'); }
        finally { setSaving(false); }
    };

    const toggle = async (coupon: any) => {
        const { data, error: toggleError } = await supabase.from('coupons')
            .update({ is_active: !coupon.is_active, updated_at: new Date().toISOString() }).eq('id', coupon.id).select('id').maybeSingle();
        if (toggleError || !data) { toast.error(toggleError?.message || 'Coupon was not updated'); return; }
        toast.success(coupon.is_active ? 'Coupon deactivated' : 'Coupon activated'); reload();
    };

    return <section className="space-y-3 p-2">
        <p className="text-xs text-[var(--text-muted)]">Create coupons for all users or selected users. The app checks discounts, expiry, plan restrictions and usage limits against the latest saved settings. Applying a coupon previews a price; it does not use the coupon or activate a subscription.</p>
        <button type="button" disabled={opening} onClick={() => void open()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Create Coupon</button>
        {coupons.map(coupon => <article key={coupon.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong className="font-mono">{coupon.code}</strong><span className="text-xs">{!coupon.is_active ? 'Inactive' : coupon.expiry_date && new Date(coupon.expiry_date) <= new Date() ? 'Expired' : 'Active'}</span></div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">{coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : formatPlanPrice(Number(coupon.discount_value))} off · {coupon.audience === 'specific' ? 'Selected users' : 'All users'} · Used {coupon.used_count || 0}/{coupon.usage_limit ?? 'unlimited'}</p>
            {coupon.expiry_date && <p className="mt-1 text-xs text-[var(--text-muted)]">Expires {new Date(coupon.expiry_date).toLocaleString('en-IN')}</p>}
            <div className="mt-3 flex gap-2"><button type="button" disabled={opening} onClick={() => void open(coupon)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs">Edit coupon</button><button type="button" onClick={() => void toggle(coupon)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs">{coupon.is_active ? 'Deactivate' : 'Activate'}</button></div>
        </article>)}
        {coupons.length === 0 && <p className="text-sm text-[var(--text-muted)]">No coupons yet.</p>}
        <dialog ref={dialog} onCancel={event => { if (saving) event.preventDefault(); }} style={{ width: 'min(512px, calc(100vw - 32px))' }} className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--on-surface)] backdrop:bg-black/60">
            <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-3">
                <h2 className="text-lg font-bold">{draft.id ? 'Edit coupon' : 'Create coupon'}</h2>
                <fieldset disabled={saving} className="space-y-3 disabled:opacity-60">
                    <label className="block text-sm">Coupon code<input required maxLength={80} value={draft.code} onChange={event => setDraft({ ...draft, code: event.target.value.toUpperCase() })} className={inputClass} /></label>
                    <div className="grid grid-cols-2 gap-3"><label className="block text-sm">Discount type<select value={draft.discount_type} onChange={event => setDraft({ ...draft, discount_type: event.target.value })} className={inputClass}><option value="flat">Flat (₹)</option><option value="percentage">Percentage (%)</option></select></label><label className="block text-sm">Discount value<input required type="number" min="0.01" max={draft.discount_type === 'percentage' ? 100 : undefined} step="0.01" value={draft.discount_value} onChange={event => setDraft({ ...draft, discount_value: event.target.value })} className={inputClass} /></label></div>
                    <div className="grid grid-cols-2 gap-3">{(['min_order','max_discount','usage_limit','per_user_limit'] as const).map(field => <label key={field} className="block text-sm">{{ min_order: 'Minimum plan price (₹)', max_discount: 'Maximum discount (₹)', usage_limit: 'Total usage limit', per_user_limit: 'Uses per user' }[field]}<input type="number" min={field === 'min_order' ? 0 : field === 'max_discount' ? .01 : 1} step={field === 'min_order' || field === 'max_discount' ? '.01' : '1'} required={field === 'per_user_limit'} value={draft[field]} onChange={event => setDraft({ ...draft, [field]: event.target.value })} placeholder={field === 'usage_limit' || field === 'max_discount' ? 'No limit' : ''} className={inputClass} /></label>)}</div>
                    <label className="block text-sm">Expiry (your local time; blank = no expiry)<input type="datetime-local" value={draft.expiry_date} onChange={event => setDraft({ ...draft, expiry_date: event.target.value })} className={inputClass} /></label>
                    <div><p className="text-sm">Applicable plans (none selected = all plans)</p><div className="mt-2 flex flex-wrap gap-3">{plans.map(plan => <label key={plan.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.applicable_plans.includes(plan.id)} onChange={event => setDraft({ ...draft, applicable_plans: event.target.checked ? [...draft.applicable_plans, plan.id] : draft.applicable_plans.filter(id => id !== plan.id) })} />{plan.name}</label>)}</div></div>
                    <label className="block text-sm">Audience<select value={draft.audience} onChange={event => setDraft({ ...draft, audience: event.target.value })} className={inputClass}><option value="global">All users</option><option value="specific">Selected users</option></select></label>
                    {draft.audience === 'specific' && <label className="block text-sm">Registered emails, one per line<textarea rows={3} value={draft.emails} onChange={event => setDraft({ ...draft, emails: event.target.value })} className={inputClass} /></label>}
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_active} onChange={event => setDraft({ ...draft, is_active: event.target.checked })} />Active</label>
                </fieldset>
                {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
                <div className="flex gap-2"><button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save coupon'}</button><button type="button" disabled={saving} onClick={() => dialog.current?.close()} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Cancel</button></div>
            </form>
        </dialog>
    </section>;
}
