import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, type NavigateOptions, type To } from 'react-router-dom';

const DEFAULT_LOCK_MS = 700;

const toPath = (to: To) => {
    if (typeof to === 'string') {
        return to;
    }

    return `${to.pathname || ''}${to.search || ''}${to.hash || ''}` || '/';
};

export function useSafeNavigate(lockMs = DEFAULT_LOCK_MS) {
    const navigate = useNavigate();
    const location = useLocation();
    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    const lastIntentRef = useRef<{ key: string; at: number } | null>(null);
    const timeoutRef = useRef<number | null>(null);
    const [navigationLocked, setNavigationLocked] = useState(false);

    const clearLock = useCallback(() => {
        setNavigationLocked(false);
        if (timeoutRef.current !== null) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        clearLock();
    }, [currentPath, clearLock]);

    useEffect(() => {
        return () => clearLock();
    }, [clearLock]);

    const safeNavigate = useCallback((to: To | number, options?: NavigateOptions) => {
        const now = Date.now();
        const key = typeof to === 'number' ? `delta:${to}` : toPath(to);

        if (typeof to !== 'number') {
            const targetPath = key || '/';
            if (targetPath === currentPath && !options?.replace) {
                return false;
            }
        }

        if (lastIntentRef.current && lastIntentRef.current.key === key && now - lastIntentRef.current.at < lockMs) {
            return false;
        }

        if (navigationLocked && lastIntentRef.current && now - lastIntentRef.current.at < lockMs) {
            return false;
        }

        lastIntentRef.current = { key, at: now };
        setNavigationLocked(true);

        if (timeoutRef.current !== null) {
            window.clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = window.setTimeout(() => {
            setNavigationLocked(false);
            timeoutRef.current = null;
        }, lockMs);

        navigate(to as any, options as any);
        return true;
    }, [currentPath, lockMs, navigate, navigationLocked]);

    return {
        navigate: safeNavigate,
        navigationLocked,
        currentPath,
    };
}
