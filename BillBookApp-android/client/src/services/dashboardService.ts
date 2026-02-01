import { supabase } from '../lib/supabase';
import { DashboardStats, PromoSlide, PaymentReminder } from '../types';

export const DashboardService = {
    /**
     * Fetches dashboard statistics (Sales, Outstanding, Top Items) via Supabase RPC.
     */
    getStats: async (companyId: string): Promise<DashboardStats | null> => {
        try {
            if (!companyId) return null;

            const { data, error } = await supabase
                .rpc('get_dashboard_stats', { company_id_param: companyId });

            if (error) {
                console.error('Error fetching dashboard stats:', error);
                return null;
            }

            return data as DashboardStats;
        } catch (err) {
            console.error('Unexpected error in getStats:', err);
            return null;
        }
    },

    /**
     * Fetches promo slides.
     * Currently returning empty array to unblock UI.
     * TODO: Connect to Supabase 'promo_slides' table.
     */
    fetchPromoSlides: async (): Promise<PromoSlide[]> => {
        try {
            // Example Supabase call:
            // const { data } = await supabase.from('promo_slides').select('*').eq('isActive', true);
            // return data || [];
            return [];
        } catch (error) {
            console.error('Error fetching promo slides:', error);
            return [];
        }
    },

    /**
     * Seeds default promo slides if needed.
     */
    seedPromoSlides: async () => {
        // No-op for now
    },

    /**
     * Subscribes to Payment Reminders (Vasool Karo).
     * TODO: Implement Supabase Realtime subscription.
     */
    subscribeToTodaysReminders: (userId: string, callback: (reminders: PaymentReminder[]) => void) => {
        // Return empty list for now
        callback([]);

        // Return unsubscribe function
        return () => {
            // Unsubscribe logic would go here
        };
    }
};
