/**
 * Theme Service
 * Manages dark/light mode with system preference detection and persistence
 */

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export type ThemeMode = 'light' | 'dark' | 'system';

class ThemeService {
    private currentTheme: ThemeMode = 'system';
    private listeners: Set<(isDark: boolean) => void> = new Set();
    private mediaQuery: MediaQueryList | null = null;

    constructor() {
        this.loadTheme();
        this.setupSystemThemeListener();
    }

    /**
     * Load theme from storage
     */
    private loadTheme(): void {
        const saved = localStorage.getItem('app_theme') as ThemeMode | null;
        this.currentTheme = saved || 'system';
        this.applyTheme();
    }

    /**
     * Setup listener for system theme changes
     */
    private setupSystemThemeListener(): void {
        if (typeof window !== 'undefined' && window.matchMedia) {
            this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            this.mediaQuery.addEventListener('change', () => {
                if (this.currentTheme === 'system') {
                    this.applyTheme();
                }
            });
        }
    }

    /**
     * Get current theme mode
     */
    getTheme(): ThemeMode {
        return this.currentTheme;
    }

    /**
     * Check if dark mode is active
     */
    isDarkMode(): boolean {
        if (this.currentTheme === 'system') {
            return this.mediaQuery?.matches ?? false;
        }
        return this.currentTheme === 'dark';
    }

    /**
     * Set theme mode
     */
    async setTheme(mode: ThemeMode): Promise<void> {
        this.currentTheme = mode;
        localStorage.setItem('app_theme', mode);
        await this.applyTheme();

        // Notify listeners
        this.listeners.forEach(listener => listener(this.isDarkMode()));
    }

    /**
     * Toggle between light and dark
     */
    async toggle(): Promise<void> {
        const newMode = this.isDarkMode() ? 'light' : 'dark';
        await this.setTheme(newMode);
    }

    /**
     * Apply theme to document
     */
    private async applyTheme(): Promise<void> {
        const isDark = this.isDarkMode();

        // Apply to document
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        // Update status bar on mobile
        if (Capacitor.isNativePlatform()) {
            try {
                await StatusBar.setStyle({
                    style: isDark ? Style.Dark : Style.Light
                });
                await StatusBar.setBackgroundColor({
                    color: isDark ? '#0f172a' : '#f8fafc'
                });
            } catch (error) {
                console.log('[ThemeService] StatusBar update failed:', error);
            }
        }

        // Update meta theme-color
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', isDark ? '#0f172a' : '#f8fafc');
        }

        console.log(`[ThemeService] Theme applied: ${this.currentTheme} (isDark: ${isDark})`);
    }

    /**
     * Subscribe to theme changes
     */
    subscribe(callback: (isDark: boolean) => void): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Get theme icon based on current mode
     */
    getThemeIcon(): 'sun' | 'moon' | 'monitor' {
        switch (this.currentTheme) {
            case 'light':
                return 'sun';
            case 'dark':
                return 'moon';
            default:
                return 'monitor';
        }
    }

    /**
     * Get theme label
     */
    getThemeLabel(): string {
        switch (this.currentTheme) {
            case 'light':
                return 'Light Mode';
            case 'dark':
                return 'Dark Mode';
            default:
                return 'System Default';
        }
    }
}

// Export singleton instance
export const themeService = new ThemeService();
export default themeService;
