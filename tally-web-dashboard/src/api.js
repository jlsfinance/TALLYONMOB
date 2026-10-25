import { portalApi } from './lib/supabase';

// Export portalApi for direct use
export { portalApi };

// Alias contactApi to portalApi for backward compatibility or semantic clarity
export const contactApi = portalApi;

// Deprecated default export to prevent breaking imports (though none were found)
const api = {
    getDashboardData: async () => {
        console.warn('Deprecated: Use supabase directly or portalApi');
        return null;
    },
    getLedgers: async () => {
        console.warn('Deprecated: Use supabase directly or masterApi');
        return [];
    }
};

export default api;
