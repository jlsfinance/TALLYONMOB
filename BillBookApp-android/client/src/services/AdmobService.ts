/**
 * AdMob Service for BillBook App
 * Handles banner ads, interstitial ads, and rewarded ads
 */

import { AdMob, BannerAdOptions, BannerAdSize, BannerAdPosition, AdOptions, AdLoadInfo, InterstitialAdPluginEvents, RewardAdPluginEvents } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

// AdMob Configuration
// TODO: Replace these with your actual AdMob IDs from Google AdMob Console
const ADMOB_CONFIG = {
    // Test IDs (Replace with your production IDs before release)
    android: {
        appId: 'ca-app-pub-6759555893369464~7376754414', // Production App ID
        banner: 'ca-app-pub-6759555893369464/6933901286', // Production Banner ID
        interstitial: '', // (Disabled by User)
        rewarded: 'ca-app-pub-3940256099942544/5224354917', // Test Rewarded ID
    },
    ios: {
        appId: 'ca-app-pub-3940256099942544~1458002511', // Test App ID
        banner: 'ca-app-pub-3940256099942544/2934735716', // Test Banner ID
        interstitial: 'ca-app-pub-3940256099942544/4411468910', // Test Interstitial ID
        rewarded: 'ca-app-pub-3940256099942544/1712485313', // Test Rewarded ID
    }
};

class AdmobService {
    private initialized = false;
    private interstitialLoaded = false;
    private rewardedLoaded = false;

    /**
     * Initialize AdMob SDK
     */
    async initialize(): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) {
            console.log('[AdMob] Not running on native platform, skipping initialization');
            return false;
        }

        if (this.initialized) {
            return true;
        }

        try {
            await AdMob.initialize({
                testingDevices: [], // Add your test device IDs here
                initializeForTesting: false, // Use test ads
            });

            this.initialized = true;
            console.log('[AdMob] SDK initialized successfully');

            // Setup event listeners
            this.setupEventListeners();

            return true;
        } catch (error) {
            console.error('[AdMob] Initialization failed:', error);
            return false;
        }
    }

    /**
     * Setup event listeners for ads
     */
    private setupEventListeners(): void {
        // Interstitial events
        AdMob.addListener(InterstitialAdPluginEvents.Loaded, (info: AdLoadInfo) => {
            console.log('[AdMob] Interstitial loaded:', info);
            this.interstitialLoaded = true;
        });

        AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, (error: any) => {
            console.error('[AdMob] Interstitial failed to load:', error);
            this.interstitialLoaded = false;
        });

        AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
            console.log('[AdMob] Interstitial dismissed');
            this.interstitialLoaded = false;
            // Preload next interstitial
            this.prepareInterstitial();
        });

        // Rewarded events
        AdMob.addListener(RewardAdPluginEvents.Loaded, (info: AdLoadInfo) => {
            console.log('[AdMob] Rewarded ad loaded:', info);
            this.rewardedLoaded = true;
        });

        AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (error: any) => {
            console.error('[AdMob] Rewarded ad failed to load:', error);
            this.rewardedLoaded = false;
        });

        AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
            console.log('[AdMob] Rewarded ad dismissed');
            this.rewardedLoaded = false;
            // Preload next rewarded
            this.prepareRewarded();
        });
    }

    /**
     * Get the ad unit ID based on platform
     */
    private getAdUnitId(type: 'banner' | 'interstitial' | 'rewarded'): string {
        const platform = Capacitor.getPlatform();
        if (platform === 'android') {
            return ADMOB_CONFIG.android[type];
        } else if (platform === 'ios') {
            return ADMOB_CONFIG.ios[type];
        }
        return ADMOB_CONFIG.android[type]; // Default to Android
    }

    /**
     * Show banner ad
     */
    async showBanner(position: 'top' | 'bottom' = 'bottom'): Promise<boolean> {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!Capacitor.isNativePlatform()) {
            return false;
        }

        try {
            const options: BannerAdOptions = {
                adId: this.getAdUnitId('banner'),
                adSize: BannerAdSize.ADAPTIVE_BANNER,
                position: position === 'top' ? BannerAdPosition.TOP_CENTER : BannerAdPosition.BOTTOM_CENTER,
                margin: 0,
                isTesting: false,
            };

            await AdMob.showBanner(options);
            console.log('[AdMob] Banner shown successfully');
            return true;
        } catch (error) {
            console.error('[AdMob] Failed to show banner:', error);
            return false;
        }
    }

    /**
     * Hide banner ad
     */
    async hideBanner(): Promise<void> {
        if (!Capacitor.isNativePlatform()) {
            return;
        }

        try {
            await AdMob.hideBanner();
            console.log('[AdMob] Banner hidden');
        } catch (error) {
            console.error('[AdMob] Failed to hide banner:', error);
        }
    }

    /**
     * Remove banner ad
     */
    async removeBanner(): Promise<void> {
        if (!Capacitor.isNativePlatform()) {
            return;
        }

        try {
            await AdMob.removeBanner();
            console.log('[AdMob] Banner removed');
        } catch (error) {
            console.error('[AdMob] Failed to remove banner:', error);
        }
    }

    /**
     * Prepare interstitial ad
     */
    async prepareInterstitial(): Promise<boolean> {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!Capacitor.isNativePlatform()) {
            return false;
        }

        const adId = this.getAdUnitId('interstitial');
        if (!adId) return false;

        try {
            const options: AdOptions = {
                adId: adId,
                isTesting: false,
            };

            await AdMob.prepareInterstitial(options);
            console.log('[AdMob] Interstitial prepared');
            return true;
        } catch (error) {
            console.error('[AdMob] Failed to prepare interstitial:', error);
            return false;
        }
    }

    /**
     * Show interstitial ad
     */
    async showInterstitial(): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) {
            return false;
        }

        if (!this.interstitialLoaded) {
            console.log('[AdMob] Interstitial not loaded, preparing...');
            await this.prepareInterstitial();
            // Wait a bit for ad to load
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        try {
            await AdMob.showInterstitial();
            console.log('[AdMob] Interstitial shown');
            return true;
        } catch (error) {
            console.error('[AdMob] Failed to show interstitial:', error);
            return false;
        }
    }

    /**
     * Prepare rewarded ad
     */
    async prepareRewarded(): Promise<boolean> {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!Capacitor.isNativePlatform()) {
            return false;
        }

        try {
            const options: AdOptions = {
                adId: this.getAdUnitId('rewarded'),
                isTesting: false,
            };

            await AdMob.prepareRewardVideoAd(options);
            console.log('[AdMob] Rewarded ad prepared');
            return true;
        } catch (error) {
            console.error('[AdMob] Failed to prepare rewarded ad:', error);
            return false;
        }
    }

    /**
     * Show rewarded ad
     */
    async showRewarded(): Promise<{ reward: boolean; type?: string; amount?: number }> {
        if (!Capacitor.isNativePlatform()) {
            return { reward: false };
        }

        if (!this.rewardedLoaded) {
            console.log('[AdMob] Rewarded not loaded, preparing...');
            await this.prepareRewarded();
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        try {
            const result = await AdMob.showRewardVideoAd();
            console.log('[AdMob] Rewarded ad completed:', result);
            return {
                reward: true,
                type: result?.type || 'coins',
                amount: result?.amount || 1
            };
        } catch (error) {
            console.error('[AdMob] Failed to show rewarded ad:', error);
            return { reward: false };
        }
    }

    /**
     * Check if interstitial is ready
     */
    isInterstitialReady(): boolean {
        return this.interstitialLoaded;
    }

    /**
     * Check if rewarded is ready
     */
    isRewardedReady(): boolean {
        return this.rewardedLoaded;
    }

    /**
     * Check if running on native platform
     */
    isNative(): boolean {
        return Capacitor.isNativePlatform();
    }
}

// NOTE: Set isTesting to false before production release

// Export singleton instance
export const admobService = new AdmobService();
export default admobService;
