import { useCallback, useEffect, useRef, useState } from 'react';

// Retain rendered rows when returning to a tab, so its scroll position can be restored.
const savedCounts = new Map<string, number>();
const PAGE_SIZE = 60;

export function useProgressiveList<T>(items: T[], key: string) {
    const [state, setState] = useState(() => ({ key, count: savedCounts.get(key) || PAGE_SIZE }));
    const count = state.key === key ? state.count : (savedCounts.get(key) || PAGE_SIZE);
    const observer = useRef<IntersectionObserver | null>(null);
    useEffect(() => () => observer.current?.disconnect(), []);
    const loadMore = useCallback(() => {
        setState(previous => {
            const current = previous.key === key ? previous.count : (savedCounts.get(key) || PAGE_SIZE);
            const next = Math.min(current + PAGE_SIZE, items.length);
            savedCounts.set(key, next);
            return { key, count: next };
        });
    }, [key, items.length]);
    const sentinelRef = useCallback((node: HTMLDivElement | null) => {
        observer.current?.disconnect();
        if (!node || count >= items.length || typeof IntersectionObserver === 'undefined') return;
        observer.current = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) loadMore();
        }, { rootMargin: '600px 0px' });
        observer.current.observe(node);
    }, [count, items.length, loadMore]);
    return { visible: items.slice(0, count), hasMore: count < items.length, loadMore, sentinelRef, count };
}
