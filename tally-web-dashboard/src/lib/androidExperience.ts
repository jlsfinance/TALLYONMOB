import { Capacitor } from '@capacitor/core';

/** Opt in only on Android. The preview switch is unavailable in production web builds. */
export function initializeAndroidExperience() {
    const android = Capacitor.getPlatform() === 'android';
    const preview = import.meta.env.DEV && (
        new URLSearchParams(window.location.search).get('native-preview') === 'android'
        || window.sessionStorage.getItem('syncora.android-preview') === 'true'
    );
    if (!android && !preview) return;
    document.documentElement.dataset.platform = 'android';
    if (preview) window.sessionStorage.setItem('syncora.android-preview', 'true');
    if (!android) return;
    document.addEventListener('pointerup', event => {
        const target = event.target instanceof Element ? event.target.closest('[data-native-feedback]') : null;
        if (!target || target.matches(':disabled,[aria-disabled="true"]')) return;
        void import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light })).catch(() => {});
    }, { passive: true });
}
