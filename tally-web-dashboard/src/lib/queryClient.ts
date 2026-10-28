import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000,        // 5 minutes — data fresh
            cacheTime: 30 * 60 * 1000,           // 30 minutes — cache persists long
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            refetchOnMount: true,              // Show cached data and refresh stale queries in background
            retry: 1,
        },
    },
});
