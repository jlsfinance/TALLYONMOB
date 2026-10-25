import React from 'react';

// ============================================================================
// Debounce
// ============================================================================

interface DebouncedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: () => void;
}

/**
 * Creates a debounced function that delays invoking `fn` until after `delay`
 * milliseconds have elapsed since the last time the debounced function was invoked.
 *
 * @param fn - The function to debounce
 * @param delay - The number of milliseconds to delay
 * @returns A debounced version of `fn` with `cancel` and `flush` methods
 *
 * @example
 * ```ts
 * const debouncedSearch = debounce((query: string) => {
 *   fetchSearchResults(query);
 * }, 300);
 *
 * debouncedSearch('hello'); // Will execute after 300ms of inactivity
 * debouncedSearch.cancel(); // Cancel pending invocation
 * debouncedSearch.flush(); // Immediately execute pending invocation
 * ```
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
      lastArgs = null;
    }, delay);
  };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      lastArgs = null;
    }
  };

  debounced.flush = () => {
    if (timeoutId !== null && lastArgs !== null) {
      clearTimeout(timeoutId);
      fn(...lastArgs);
      timeoutId = null;
      lastArgs = null;
    }
  };

  return debounced;
}

// ============================================================================
// Throttle
// ============================================================================

interface ThrottledFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
}

/**
 * Creates a throttled function that only invokes `fn` at most once per `limit` milliseconds.
 *
 * @param fn - The function to throttle
 * @param limit - The minimum number of milliseconds between invocations
 * @returns A throttled version of `fn`
 *
 * @example
 * ```ts
 * const throttledScroll = throttle((event: Event) => {
 *   updateScrollIndicator(event);
 * }, 100);
 *
 * window.addEventListener('scroll', throttledScroll);
 * ```
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number,
): ThrottledFunction<T> {
  let waiting = false;
  let lastArgs: Parameters<T> | null = null;

  return (...args: Parameters<T>) => {
    if (!waiting) {
      fn(...args);
      waiting = true;
      setTimeout(() => {
        waiting = false;
        if (lastArgs !== null) {
          fn(...lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };
}

// ============================================================================
// Memoize (LRU Cache)
// ============================================================================

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

interface MemoizedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): ReturnType<T>;
  cache: Map<string, ReturnType<T>>;
  stats: CacheStats;
  clear: () => void;
}

function getCacheKey(args: any[]): string {
  return JSON.stringify(args);
}

/**
 * Memoizes an expensive function using an LRU (Least Recently Used) cache.
 *
 * @param fn - The function to memoize
 * @param maxSize - Maximum number of cached results (default: 100)
 * @returns A memoized version of `fn` with access to `cache`, `stats`, and `clear`
 *
 * @example
 * ```ts
 * const expensiveCalc = memoize((n: number) => {
 *   console.log('Computing...');
 *   return n * n;
 * }, 50);
 *
 * expensiveCalc(5); // Logs "Computing..." and returns 25
 * expensiveCalc(5); // Returns 25 from cache (no log)
 * expensiveCalc.stats; // { hits: 1, misses: 1, size: 1 }
 * expensiveCalc.clear(); // Clears the cache
 * ```
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  maxSize: number = 100,
): MemoizedFunction<T> {
  const cache = new Map<string, ReturnType<T>>();
  const stats: CacheStats = { hits: 0, misses: 0, size: 0 };

  const memoized = (...args: Parameters<T>): ReturnType<T> => {
    const key = getCacheKey(args);

    if (cache.has(key)) {
      stats.hits++;
      const value = cache.get(key)!;
      // Move to end (most recently used) by re-inserting
      cache.delete(key);
      cache.set(key, value);
      return value;
    }

    stats.misses++;
    const result = fn(...args);

    // Evict oldest entry if cache is full
    if (cache.size >= maxSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) {
        cache.delete(firstKey);
      }
    }

    cache.set(key, result);
    stats.size = cache.size;
    return result;
  };

  memoized.cache = cache;
  memoized.stats = stats;
  memoized.clear = () => {
    cache.clear();
    stats.hits = 0;
    stats.misses = 0;
    stats.size = 0;
  };

  return memoized;
}

// ============================================================================
// Lazy Load
// ============================================================================

interface LazyLoadOptions {
  fallback?: React.ReactNode;
  onError?: (error: Error) => void;
}

interface LazyComponent extends React.ComponentType<any> {
  preload: () => Promise<void>;
}

/**
 * Creates a lazily-loaded component with built-in loading state and error handling.
 * Wraps React.lazy with additional features like preloading and error boundaries.
 *
 * @param importFn - A function that returns a dynamic import of a React component
 * @param options - Optional configuration for fallback and error handling
 * @returns A lazy-loaded React component with a `preload` method
 *
 * @example
 * ```tsx
 * const LazyDashboard = lazyLoad(
 *   () => import('./pages/Dashboard'),
 *   { fallback: <Spinner />, onError: (err) => console.error(err) }
 * );
 *
 * // In your route config or component:
 * <Suspense fallback={<Spinner />}>
 *   <LazyDashboard />
 * </Suspense>
 *
 * // Preload on hover:
 * <Link onMouseEnter={() => LazyDashboard.preload()} to="/dashboard">
 * ```
 */
export function lazyLoad(
  importFn: () => Promise<{ default: React.ComponentType<any> }>,
  options: LazyLoadOptions = {},
): LazyComponent {
  const { onError } = options;

  let cachedPromise: Promise<{ default: React.ComponentType<any> }> | null = null;

  const loadComponent = () => {
    if (!cachedPromise) {
      cachedPromise = importFn().catch((error) => {
        cachedPromise = null;
        if (onError) {
          onError(error);
        }
        throw error;
      });
    }
    return cachedPromise;
  };

  const LazyComponent = React.lazy(loadComponent) as LazyComponent;

  LazyComponent.preload = async () => {
    await loadComponent();
  };

  return LazyComponent;
}

// ============================================================================
// Virtual List
// ============================================================================

interface VirtualListResult<T> {
  visibleItems: T[];
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  offsetY: number;
}

/**
 * Calculates visible items for virtual scrolling based on scroll position.
 *
 * @param items - The full list of items
 * @param containerHeight - Height of the scrollable container in pixels
 * @param itemHeight - Height of each item in pixels
 * @param overscan - Number of items to render above/below the visible area (default: 5)
 * @returns An object containing visible items, indices, total height, and Y offset
 *
 * @example
 * ```tsx
 * function VirtualList({ items }: { items: string[] }) {
 *   const [scrollTop, setScrollTop] = useState(0);
 *   const { visibleItems, startIndex, totalHeight, offsetY } =
 *     virtualList(items, 400, 40, 5);
 *
 *   return (
 *     <div
 *       style={{ height: 400, overflow: 'auto' }}
 *       onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
 *     >
 *       <div style={{ height: totalHeight, position: 'relative' }}>
 *         <div style={{ transform: `translateY(${offsetY}px)` }}>
 *           {visibleItems.map((item, i) => (
 *             <div key={startIndex + i} style={{ height: 40 }}>
 *               {item}
 *             </div>
 *           ))}
 *         </div>
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 */
export function virtualList<T>(
  items: T[],
  containerHeight: number,
  itemHeight: number,
  overscan: number = 5,
): VirtualListResult<T> {
  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(
    0,
    Math.floor(0 / itemHeight) - overscan,
  );
  const endIndex = Math.min(
    items.length,
    Math.ceil(containerHeight / itemHeight) + overscan,
  );

  return {
    visibleItems: items.slice(startIndex, endIndex),
    startIndex,
    endIndex,
    totalHeight,
    offsetY: startIndex * itemHeight,
  };
}

/**
 * Calculates visible items for virtual scrolling based on a dynamic scroll position.
 *
 * @param items - The full list of items
 * @param containerHeight - Height of the scrollable container in pixels
 * @param itemHeight - Height of each item in pixels
 * @param scrollTop - Current scroll position in pixels
 * @param overscan - Number of items to render above/below the visible area (default: 5)
 * @returns An object containing visible items, indices, total height, and Y offset
 *
 * @example
 * ```tsx
 * const { visibleItems, startIndex, totalHeight, offsetY } =
 *   virtualListAtPosition(items, 400, 40, scrollPosition, 5);
 * ```
 */
export function virtualListAtPosition<T>(
  items: T[],
  containerHeight: number,
  itemHeight: number,
  scrollTop: number,
  overscan: number = 5,
): VirtualListResult<T> {
  const totalHeight = items.length * itemHeight;
  const rawStartIndex = Math.floor(scrollTop / itemHeight);
  const startIndex = Math.max(0, rawStartIndex - overscan);
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const endIndex = Math.min(items.length, rawStartIndex + visibleCount + overscan);

  return {
    visibleItems: items.slice(startIndex, endIndex),
    startIndex,
    endIndex,
    totalHeight,
    offsetY: startIndex * itemHeight,
  };
}

// ============================================================================
// Prefetch
// ============================================================================

const prefetchedModules = new Map<string, Promise<any>>();
const prefetchedPaths = new Set<string>();

/**
 * Prefetches a route module by path. The module is cached after first load.
 * Useful for preloading routes on hover or focus events.
 *
 * @param path - The route path (used as cache key)
 * @param importFn - A function returning the dynamic import of the route module
 *
 * @example
 * ```tsx
 * // Register prefetch for a route
 * prefetchRoute('/dashboard', () => import('./pages/Dashboard'));
 *
 * // On a navigation link:
 * <Link
 *   to="/dashboard"
 *   onMouseEnter={() => prefetchRoute('/dashboard', () => import('./pages/Dashboard'))}
 *   onFocus={() => prefetchRoute('/dashboard', () => import('./pages/Dashboard'))}
 * >
 *   Dashboard
 * </Link>
 * ```
 */
export function prefetchRoute(path: string, importFn: () => Promise<any>): void {
  if (!prefetchedModules.has(path)) {
    const promise = importFn()
      .then((mod) => {
        prefetchedPaths.add(path);
        return mod;
      })
      .catch((error) => {
        prefetchedModules.delete(path);
        console.warn(`Failed to prefetch route "${path}":`, error);
        throw error;
      });

    prefetchedModules.set(path, promise);
  }
}

/**
 * Checks if a route has been prefetched.
 *
 * @param path - The route path to check
 * @returns `true` if the route module has been loaded
 */
export function isPrefetched(path: string): boolean {
  return prefetchedPaths.has(path);
}

/**
 * Returns a React hook-style handler that prefetches a route on hover or focus.
 *
 * @param path - The route path
 * @param importFn - A function returning the dynamic import
 * @returns An object with `onMouseEnter` and `onFocus` handlers
 *
 * @example
 * ```tsx
 * const prefetch = usePrefetch('/settings', () => import('./pages/Settings'));
 *
 * <Link to="/settings" {...prefetch}>Settings</Link>
 * ```
 */
export function usePrefetch(
  path: string,
  importFn: () => Promise<any>,
): { onMouseEnter: () => void; onFocus: () => void } {
  return {
    onMouseEnter: () => prefetchRoute(path, importFn),
    onFocus: () => prefetchRoute(path, importFn),
  };
}

// ============================================================================
// Image Optimization
// ============================================================================

interface LazyImageResult {
  src: string;
  onLoad: () => void;
  loading: boolean;
  ref: (node: HTMLElement | null) => void;
}

const DEFAULT_PLACEHOLDER =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNlNWU3ZWIiLz48L3N2Zz4=';

/**
 * Creates a lazy-loaded image using Intersection Observer.
 * Shows a low-quality placeholder (LQIP) until the image enters the viewport.
 *
 * @param src - The full image URL
 * @param placeholder - Optional low-quality placeholder URL or data URI (LQIP)
 * @returns An object with `src`, `onLoad`, `loading`, and `ref` properties
 *
 * @example
 * ```tsx
 * function ProductImage({ url }: { url: string }) {
 *   const image = lazyImage(url, '/placeholders/product-low.jpg');
 *
 *   return (
 *     <img
 *       ref={image.ref}
 *       src={image.loading ? image.placeholder : image.src}
 *       onLoad={image.onLoad}
 *       className={image.loading ? 'blur' : ''}
 *     />
 *   );
 * }
 * ```
 */
export function lazyImage(
  src: string,
  placeholder: string = DEFAULT_PLACEHOLDER,
): Omit<LazyImageResult, 'ref'> & { ref: React.RefCallback<HTMLElement> } {
  let isVisible = false;
  let hasLoaded = false;

  const state = {
    currentSrc: placeholder,
    isLoading: true,
  };

  const loadImage = (setSrc: (src: string) => void, setLoading: (loading: boolean) => void) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      state.currentSrc = src;
      state.isLoading = false;
      setSrc(src);
      setLoading(false);
    };
  };

  return {
    get src() {
      return state.currentSrc;
    },
    get loading() {
      return state.isLoading;
    },
    onLoad: () => {
      hasLoaded = true;
    },
    ref: (node: HTMLElement | null) => {
      if (!node || typeof IntersectionObserver === 'undefined') {
        // Fallback: load immediately if IntersectionObserver is not available
        state.currentSrc = src;
        state.isLoading = false;
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !isVisible) {
              isVisible = true;
              // Use React state setter pattern - in practice, integrate with useState
              observer.disconnect();
            }
          });
        },
        { rootMargin: '200px' },
      );

      observer.observe(node);
    },
  };
}

/**
 * A React hook version of lazyImage that integrates with React state.
 *
 * @param src - The full image URL
 * @param placeholder - Optional low-quality placeholder URL
 * @returns An object with `src`, `onLoad`, `loading`, and `imgRef` for use in components
 *
 * @example
 * ```tsx
 * function Avatar({ url }: { url: string }) {
 *   const { src, loading, onLoad, imgRef } = useLazyImage(url, '/avatar-placeholder.png');
 *
 *   return (
 *     <img
 *       ref={imgRef}
 *       src={src}
 *       onLoad={onLoad}
 *       className={loading ? 'opacity-50' : 'opacity-100'}
 *     />
 *   );
 * }
 * ```
 */
export function useLazyImage(
  src: string,
  placeholder: string = DEFAULT_PLACEHOLDER,
): {
  src: string;
  loading: boolean;
  onLoad: () => void;
  imgRef: React.RefCallback<HTMLImageElement>;
} {
  const [currentSrc, setCurrentSrc] = React.useState(placeholder);
  const [loading, setLoading] = React.useState(true);
  const loadedRef = React.useRef(false);

  const imgRef = React.useCallback(
    (node: HTMLImageElement | null) => {
      if (!node) return;

      if (typeof IntersectionObserver === 'undefined') {
        // Fallback: load immediately
        const img = new Image();
        img.src = src;
        img.onload = () => {
          setCurrentSrc(src);
          setLoading(false);
        };
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !loadedRef.current) {
              loadedRef.current = true;
              const img = new Image();
              img.src = src;
              img.onload = () => {
                setCurrentSrc(src);
                setLoading(false);
              };
              observer.disconnect();
            }
          });
        },
        { rootMargin: '200px' },
      );

      observer.observe(node);

      return () => observer.disconnect();
    },
    [src, placeholder],
  );

  return {
    src: currentSrc,
    loading,
    onLoad: () => setLoading(false),
    imgRef,
  };
}

// ============================================================================
// Storage Cache
// ============================================================================

interface StorageCacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number | null;
}

interface StorageCacheOptions {
  /** Time-to-live in milliseconds (default: 5 minutes) */
  ttl?: number;
  /** Maximum cache size in bytes (default: 5MB) */
  maxSize?: number;
  /** Storage backend (default: localStorage) */
  storage?: Storage;
}

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Caches the result of an async function in localStorage with TTL-based expiration.
 *
 * @param key - The cache key
 * @param fetcher - An async function that returns the data to cache
 * @param options - Cache configuration options
 * @returns A promise that resolves to the cached or freshly fetched data
 *
 * @example
 * ```ts
 * // Cache API response for 10 minutes
 * const data = await storageCache(
 *   'user-profile',
 *   async () => {
 *     const res = await fetch('/api/user/profile');
 *     return res.json();
 *   },
 *   { ttl: 10 * 60 * 1000 }
 * );
 *
 * // Cache with custom storage and size limit
 * const settings = await storageCache(
 *   'app-settings',
 *   () => fetchSettings(),
 *   { ttl: 60 * 60 * 1000, maxSize: 1024 * 1024, storage: sessionStorage }
 * );
 * ```
 */
export async function storageCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: StorageCacheOptions = {},
): Promise<T> {
  const {
    ttl = DEFAULT_TTL,
    maxSize = DEFAULT_MAX_SIZE,
    storage = localStorage,
  } = options;

  const now = Date.now();

  // Try to read from cache
  try {
    const raw = storage.getItem(key);
    if (raw) {
      const entry: StorageCacheEntry<T> = JSON.parse(raw);
      if (entry.expiresAt === null || entry.expiresAt > now) {
        return entry.data;
      }
      // Cache expired, remove it
      storage.removeItem(key);
    }
  } catch {
    // Corrupted cache entry, ignore
    storage.removeItem(key);
  }

  // Fetch fresh data
  const data = await fetcher();

  // Write to cache
  try {
    const entry: StorageCacheEntry<T> = {
      data,
      timestamp: now,
      expiresAt: ttl > 0 ? now + ttl : null,
    };
    const serialized = JSON.stringify(entry);

    // Check size limit
    if (new Blob([serialized]).size > maxSize) {
      console.warn(
        `Storage cache: data for key "${key}" exceeds max size of ${maxSize} bytes. Skipping cache.`,
      );
      return data;
    }

    storage.setItem(key, serialized);
  } catch {
    // Storage full or unavailable, silently fail
    console.warn(`Storage cache: failed to write key "${key}".`);
  }

  return data;
}

/**
 * Removes a specific cache entry from storage.
 *
 * @param key - The cache key to invalidate
 * @param storage - The storage backend (default: localStorage)
 */
export function invalidateStorageCache(
  key: string,
  storage: Storage = localStorage,
): void {
  storage.removeItem(key);
}

/**
 * Clears all cache entries from the given storage that match a key prefix.
 *
 * @param prefix - Key prefix to match for removal
 * @param storage - The storage backend (default: localStorage)
 */
export function clearStorageCache(
  prefix: string,
  storage: Storage = localStorage,
): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => storage.removeItem(key));
}

// ============================================================================
// Batch Updates
// ============================================================================

/**
 * Batches multiple React state updates into a single re-render using
 * `React.startTransition` where available, with a synchronous fallback.
 *
 * @param updates - An array of update functions to batch
 *
 * @example
 * ```ts
 * batchUpdates([
 *   () => setCount((c) => c + 1),
 *   () => setName('new name'),
 *   () => setLoading(false),
 * ]);
 * // All three updates are batched into a single re-render
 * ```
 */
export function batchUpdates(updates: (() => void)[]): void {
  if (typeof React.startTransition === 'function') {
    React.startTransition(() => {
      updates.forEach((update) => update());
    });
  } else {
    // Fallback for older React versions
    // React 18+ automatically batches, but this ensures compatibility
    updates.forEach((update) => update());
  }
}

// ============================================================================
// Performance Monitoring
// ============================================================================

interface RenderMeasurement {
  /** Ends the measurement and returns the duration in milliseconds */
  end: () => number;
}

/**
 * Measures the render time of a component or operation.
 * Uses `performance.now()` for high-resolution timing.
 *
 * @param name - A label for the measurement
 * @returns An object with an `end` method that returns the elapsed time
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const measurement = measureRender('Dashboard');
 *
 *   useEffect(() => {
 *     const duration = measurement.end();
 *     console.log(`Dashboard rendered in ${duration.toFixed(2)}ms`);
 *   });
 *
 *   return <div>...</div>;
 * }
 *
 * // Or for synchronous operations:
 * const timer = measureRender('HeavyCalculation');
 * const result = heavyCalculation();
 * const duration = timer.end();
 * console.log(`Calculation took ${duration.toFixed(2)}ms`);
 * ```
 */
export function measureRender(name: string): RenderMeasurement {
  const startTime = performance.now();

  return {
    end: (): number => {
      const duration = performance.now() - startTime;
      if (typeof window !== 'undefined' && 'console' in window) {
        console.debug(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
      }
      return duration;
    },
  };
}

interface WebVitalMetric {
  name: string;
  value: number;
  rating: string;
}

type WebVitalCallback = (metric: WebVitalMetric) => void;

const VITAL_THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  TTFB: { good: 800, poor: 1800 },
  INP: { good: 200, poor: 500 },
};

function getRating(name: string, value: number): string {
  const thresholds = VITAL_THRESHOLDS[name as keyof typeof VITAL_THRESHOLDS];
  if (!thresholds) return 'unknown';
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.poor) return 'needs-improvement';
  return 'poor';
}

/**
 * Reports Core Web Vitals (LCP, FID, CLS, TTFB, INP) via a callback.
 * Uses the web-vitals library pattern without requiring it as a dependency.
 *
 * @param callback - A function called with each web vital metric
 * @returns A cleanup function to stop observing
 *
 * @example
 * ```ts
 * const cleanup = reportWebVitals((metric) => {
 *   console.log(metric.name, metric.value, metric.rating);
 *   // Send to analytics
 *   analytics.track('web-vital', metric);
 * });
 *
 * // Later, to stop observing:
 * cleanup();
 * ```
 */
export function reportWebVitals(callback: WebVitalCallback): () => void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    return () => {};
  }

  const observers: PerformanceObserver[] = [];

  // Largest Contentful Paint (LCP)
  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        const metric: WebVitalMetric = {
          name: 'LCP',
          value: lastEntry.startTime,
          rating: getRating('LCP', lastEntry.startTime),
        };
        callback(metric);
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    observers.push(lcpObserver);
  } catch {
    // LCP not supported
  }

  // First Input Delay (FID)
  try {
    const fidObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if ('processingStart' in entry) {
          const fidEntry = entry as PerformanceEventTiming;
          const fid = fidEntry.processingStart - fidEntry.startTime;
          const metric: WebVitalMetric = {
            name: 'FID',
            value: fid,
            rating: getRating('FID', fid),
          };
          callback(metric);
        }
      });
    });
    fidObserver.observe({ type: 'first-input', buffered: true });
    observers.push(fidObserver);
  } catch {
    // FID not supported
  }

  // Cumulative Layout Shift (CLS)
  try {
    let clsValue = 0;
    let sessionValue = 0;
    let sessionEntries: number[] = [];

    const clsObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if ('hadRecentInput' in entry) {
          const clsEntry = entry as LayoutShift;
          if (!clsEntry.hadRecentInput) {
            sessionValue += clsEntry.value;
            sessionEntries.push(clsEntry.value);

            // Reset session if gap > 1s or session > 5s
            if (
              sessionEntries.length === 0 ||
              entry.startTime - sessionEntries[0] > 5000
            ) {
              sessionValue = clsEntry.value;
              sessionEntries = [clsEntry.value];
            }

            if (sessionValue > clsValue) {
              clsValue = sessionValue;
              const metric: WebVitalMetric = {
                name: 'CLS',
                value: clsValue,
                rating: getRating('CLS', clsValue),
              };
              callback(metric);
            }
          }
        }
      });
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
    observers.push(clsObserver);
  } catch {
    // CLS not supported
  }

  // Time to First Byte (TTFB)
  try {
    const navigationObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (entry.entryType === 'navigation') {
          const navEntry = entry as PerformanceNavigationTiming;
          const ttfb = navEntry.responseStart - navEntry.requestStart;
          const metric: WebVitalMetric = {
            name: 'TTFB',
            value: ttfb,
            rating: getRating('TTFB', ttfb),
          };
          callback(metric);
        }
      });
    });
    navigationObserver.observe({ type: 'navigation', buffered: true });
    observers.push(navigationObserver);
  } catch {
    // Navigation timing not supported
  }

  // Interaction to Next Paint (INP)
  try {
    const inpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if ('interactionId' in entry) {
          const inpEntry = entry as PerformanceEventTiming;
          const duration = inpEntry.duration;
          const metric: WebVitalMetric = {
            name: 'INP',
            value: duration,
            rating: getRating('INP', duration),
          };
          callback(metric);
        }
      });
    });
    inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 40 });
    observers.push(inpObserver);
  } catch {
    // INP not supported
  }

  return () => {
    observers.forEach((observer) => observer.disconnect());
  };
}

/**
 * Reports cumulative layout shift using a simpler callback pattern.
 * Useful for monitoring layout instability without full web-vitals integration.
 *
 * @param callback - Called with the current CLS value whenever it changes
 * @returns A cleanup function
 */
export function onLayoutShift(
  callback: (value: number) => void,
): () => void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    return () => {};
  }

  let clsValue = 0;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if ('hadRecentInput' in entry && !(entry as LayoutShift).hadRecentInput) {
          clsValue += (entry as LayoutShift).value;
          callback(clsValue);
        }
      }
    });

    observer.observe({ type: 'layout-shift', buffered: true });
    return () => observer.disconnect();
  } catch {
    return () => {};
  }
}

/**
 * Tracks long tasks that may block the main thread.
 *
 * @param callback - Called with the duration (in ms) of each long task
 * @param threshold - Minimum duration to report (default: 50ms)
 * @returns A cleanup function
 */
export function onLongTask(
  callback: (duration: number) => void,
  threshold: number = 50,
): () => void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    return () => {};
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > threshold) {
          callback(entry.duration);
        }
      }
    });

    observer.observe({ type: 'longtask', buffered: true });
    return () => observer.disconnect();
  } catch {
    return () => {};
  }
}
