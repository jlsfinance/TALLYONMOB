import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/insforge';
import { mapSubscriptionPlan, SUBSCRIPTION_PLAN_SLUGS } from '@/config/subscriptionPlans';

export function useSubscriptionCatalog() {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: ['subscription-catalog'],
        queryFn: async () => {
            const { data, error } = await supabase.from('subscription_plans')
                .select('id,slug,name,price_inr,duration_days,features,is_active,sort_order')
                .in('slug', SUBSCRIPTION_PLAN_SLUGS).eq('is_active', true).order('sort_order');
            if (error) throw error;
            return (data || []).filter(row => row.price_inr != null && Number.isFinite(Number(row.price_inr))
                && Number(row.price_inr) >= 0 && Number(row.duration_days) > 0).map(mapSubscriptionPlan);
        },
        staleTime: 0,
        refetchInterval: 5000,
        refetchOnWindowFocus: true,
    });

    useEffect(() => {
        const channel = supabase.channel('subscription-catalog-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'subscription_plans' }, () => {
                void queryClient.invalidateQueries({ queryKey: ['subscription-catalog'] });
                void queryClient.invalidateQueries({ queryKey: ['subscription-quote'] });
            }).subscribe();
        return () => { void supabase.removeChannel(channel); };
    }, [queryClient]);

    return query;
}
