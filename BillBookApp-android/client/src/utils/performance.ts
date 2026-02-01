/**
 * Performance Utilities for Low-RAM Devices
 * Helps make the app smooth on budget phones
 */

/**
 * Detect if device is low-end (low RAM / slow CPU)
 */
export function isLowEndDevice(): boolean {
    // Check device memory if available (in GB)
    const memory = (navigator as any).deviceMemory;
    if (memory && memory < 4) return true;

    // Check hardware concurrency (CPU cores)
    const cores = navigator.hardwareConcurrency;
    if (cores && cores <= 2) return true;

    // Check if connection is slow
    const connection = (navigator as any).connection;
    if (connection && (connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g')) {
        return true;
    }

    return false;
}

/**
 * Debounce function - delays execution until user stops typing
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), wait);
    };
}

/**
 * Throttle function - limits how often a function can be called
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle = false;

    return (...args: Parameters<T>) => {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Get animation settings based on device capability
 */
export function getAnimationConfig() {
    if (isLowEndDevice()) {
        // Minimal animations for low-end devices
        return {
            initial: {},
            animate: {},
            exit: {},
            transition: { duration: 0 },
            layout: false,
            drag: false,
        };
    }

    // Full animations for capable devices
    return {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -10 },
        transition: { duration: 0.2 },
        layout: true,
        drag: "x" as const,
    };
}

/**
 * Pagination helper - get items for current page
 */
export function paginate<T>(items: T[], page: number, pageSize: number = 20): T[] {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
}

/**
 * Lazy load images - only load when visible
 */
export function lazyLoadImage(element: HTMLImageElement): void {
    if ('loading' in HTMLImageElement.prototype) {
        element.loading = 'lazy';
    }
}

/**
 * Cache key generator for memoization
 */
export function generateCacheKey(...args: any[]): string {
    return JSON.stringify(args);
}

/**
 * Simple LRU Cache for expensive computations
 */
export class LRUCache<T> {
    private cache: Map<string, T> = new Map();
    private maxSize: number;

    constructor(maxSize: number = 50) {
        this.maxSize = maxSize;
    }

    get(key: string): T | undefined {
        const value = this.cache.get(key);
        if (value) {
            // Move to end (most recently used)
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }

    set(key: string, value: T): void {
        this.cache.delete(key);
        this.cache.set(key, value);

        // Remove oldest if over capacity
        if (this.cache.size > this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }
    }

    clear(): void {
        this.cache.clear();
    }
}

// Global performance flag
export const PERF_MODE = isLowEndDevice() ? 'low' : 'high';
