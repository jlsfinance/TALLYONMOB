export const SUBSCRIPTION_PLAN_SLUGS = ['monthly', 'half_yearly', 'yearly'];
export interface SubscriptionPlan {
    id: string;
    recordId: string;
    title: string;
    price: number;
    durationDays: number;
    period: string;
    badge: string;
    features: string[];
}

export function mapSubscriptionPlan(row: any): SubscriptionPlan {
    const days = Number(row.duration_days);
    const period = days === 365 ? '1 year' : days % 30 === 0
        ? `${days / 30} ${days === 30 ? 'month' : 'months'}` : `${days} days`;
    return {
        id: row.slug, recordId: row.id, title: row.name, price: Number(row.price_inr),
        durationDays: days, period,
        badge: row.slug === 'half_yearly' ? 'Popular' : row.slug === 'yearly' ? 'Best value' : '',
        features: Array.isArray(row.features) ? row.features.filter((feature: unknown) => typeof feature === 'string') : [],
    };
}

export const formatPlanPrice = (price: number) => new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(price);
