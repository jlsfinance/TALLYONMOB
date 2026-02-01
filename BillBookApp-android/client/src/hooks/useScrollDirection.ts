/**
 * useScrollDirection Hook
 * Detects scroll direction with threshold to avoid false triggers
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type ScrollDirection = 'up' | 'down' | null;

interface UseScrollDirectionOptions {
    threshold?: number;
    targetElement?: HTMLElement | null;
}

export const useScrollDirection = (options: UseScrollDirectionOptions = {}) => {
    const { threshold = 10, targetElement } = options;
    const [scrollDirection, setScrollDirection] = useState<ScrollDirection>(null);
    const lastScrollY = useRef(0);
    const ticking = useRef(false);

    const updateScrollDirection = useCallback(() => {
        const scrollY = targetElement
            ? targetElement.scrollTop
            : window.scrollY || document.documentElement.scrollTop;

        const delta = scrollY - lastScrollY.current;

        if (Math.abs(delta) >= threshold) {
            const direction: ScrollDirection = delta > 0 ? 'down' : 'up';
            setScrollDirection(direction);
            lastScrollY.current = scrollY;
        }

        ticking.current = false;
    }, [threshold, targetElement]);

    const handleScroll = useCallback(() => {
        if (!ticking.current) {
            window.requestAnimationFrame(updateScrollDirection);
            ticking.current = true;
        }
    }, [updateScrollDirection]);

    useEffect(() => {
        const target = targetElement || window;
        target.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            target.removeEventListener('scroll', handleScroll);
        };
    }, [handleScroll, targetElement]);

    return scrollDirection;
};

export default useScrollDirection;
