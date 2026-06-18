import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000,        // 5 minutes — data fresh
            gcTime: 30 * 60 * 1000,           // 30 minutes — cache persists long
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            refetchOnMount: false,             // Don't refetch if cached
            retry: 1,
        },
    },
});
