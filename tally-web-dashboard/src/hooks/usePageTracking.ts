import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { track } from '../lib/activityTracker';

export function usePageTracking(pageName: string) {
  const location = useLocation();
  const startTime = useRef(Date.now());
  const prevPath = useRef(location.pathname);

  // Track page view on mount
  useEffect(() => {
    track.pageView(pageName);
    startTime.current = Date.now();
    prevPath.current = location.pathname;

    return () => {
      // Track time spent on unmount
      const elapsed = Date.now() - startTime.current;
      if (elapsed > 1000) { // Only track if > 1 second
        track.timeSpent(pageName, elapsed);
      }
    };
  }, [location.pathname, pageName]);

  // Track time on route change
  useEffect(() => {
    const handleBeforeUnload = () => {
      const elapsed = Date.now() - startTime.current;
      if (elapsed > 1000) {
        track.timeSpent(pageName, elapsed);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pageName]);
}

export function useClickTracking(pageName: string) {
  const trackClick = (element: string) => {
    track.click(pageName, element);
  };

  return { trackClick };
}
