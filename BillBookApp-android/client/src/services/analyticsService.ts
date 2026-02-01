import { doc, updateDoc, increment, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PromoSlide } from '../types';

const ANALYTICS_COLLECTION = 'ad_analytics';
const SLIDES_COLLECTION = 'promo_slides';

export const AnalyticsService = {
    /**
     * Tracks an impression (view) of a slide.
     * Increments the 'stats.views' counter on the slide document.
     * COMPLIANCE: Uses atomic counters to avoid PII collection on passive views.
     */
    trackImpression: async (slideId: string) => {
        try {
            // Create referenced to the slide doc
            const slideRef = doc(db, SLIDES_COLLECTION, slideId);

            // Atomic increment of the view count
            await updateDoc(slideRef, {
                'stats.views': increment(1)
            });
        } catch (error) {
            // Silent fail to not disrupt UX
            // console.warn('Analytics View Error:', error); 
        }
    },

    /**
     * Tracks a click on a slide.
     * Increments the 'stats.clicks' counter AND logs a detailed event.
     * COMPLIANCE: Logs user interaction explicitly initiated by the user.
     */
    trackClick: async (slide: PromoSlide, userId?: string) => {
        try {
            if (!slide.id) return;

            // 1. Increment Aggregate Click Counter on the Slide itself
            const slideRef = doc(db, SLIDES_COLLECTION, slide.id);
            await updateDoc(slideRef, {
                'stats.clicks': increment(1)
            });

            // 2. Log Detailed Analytics Event for Reporting
            await addDoc(collection(db, ANALYTICS_COLLECTION), {
                type: 'CLICK',
                slideId: slide.id,
                slideTitle: slide.title || 'Unknown',
                targetUrl: slide.actionUrl || 'N/A',
                userId: userId || 'anonymous',
                timestamp: serverTimestamp(),
                platform: 'web',
                userAgent: navigator.userAgent // Standard analytics data
            });

            console.log(`Analytics: Tracked click for ${slide.title}`);
        } catch (error) {
            console.warn('Analytics Click Error:', error);
        }
    }
};
