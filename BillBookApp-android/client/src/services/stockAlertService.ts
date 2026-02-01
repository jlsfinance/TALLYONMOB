/**
 * Stock Alert Service
 * Monitors inventory levels and sends notifications for low stock items
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { StorageService } from './storageService';
import { Product } from '../types';

// Default low stock threshold
const DEFAULT_LOW_STOCK_THRESHOLD = 10;

export interface StockAlert {
    id: string;
    productId: string;
    productName: string;
    currentStock: number;
    threshold: number;
    alertType: 'LOW_STOCK' | 'OUT_OF_STOCK' | 'REORDER';
    createdAt: string;
    acknowledged: boolean;
}

export interface StockAlertSettings {
    enabled: boolean;
    defaultThreshold: number;
    productThresholds: { [productId: string]: number };
    notifyOnZero: boolean;
    notifyOnLow: boolean;
    dailyDigest: boolean;
    digestTime: string; // HH:MM format
}

const DEFAULT_SETTINGS: StockAlertSettings = {
    enabled: true,
    defaultThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
    productThresholds: {},
    notifyOnZero: true,
    notifyOnLow: true,
    dailyDigest: false,
    digestTime: '09:00',
};

class StockAlertService {
    private settings: StockAlertSettings = DEFAULT_SETTINGS;
    private alerts: StockAlert[] = [];

    constructor() {
        this.loadSettings();
    }

    /**
     * Load settings from storage
     */
    async loadSettings(): Promise<void> {
        try {
            const saved = localStorage.getItem('stock_alert_settings');
            if (saved) {
                this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
            }
        } catch (error) {
            console.error('[StockAlertService] Failed to load settings:', error);
        }
    }

    /**
     * Save settings to storage
     */
    async saveSettings(settings: Partial<StockAlertSettings>): Promise<void> {
        this.settings = { ...this.settings, ...settings };
        localStorage.setItem('stock_alert_settings', JSON.stringify(this.settings));
    }

    /**
     * Get current settings
     */
    getSettings(): StockAlertSettings {
        return this.settings;
    }

    /**
     * Get threshold for a specific product
     */
    getThreshold(productId: string): number {
        return this.settings.productThresholds[productId] || this.settings.defaultThreshold;
    }

    /**
     * Set threshold for a specific product
     */
    async setProductThreshold(productId: string, threshold: number): Promise<void> {
        this.settings.productThresholds[productId] = threshold;
        await this.saveSettings(this.settings);
    }

    /**
     * Check all products for low stock
     */
    async checkAllStock(): Promise<StockAlert[]> {
        if (!this.settings.enabled) return [];

        const products = await StorageService.getProducts();
        const newAlerts: StockAlert[] = [];

        for (const product of products) {
            const alert = this.checkProductStock(product);
            if (alert) {
                newAlerts.push(alert);
            }
        }

        this.alerts = newAlerts;
        return newAlerts;
    }

    /**
     * Check single product for low stock
     */
    checkProductStock(product: Product): StockAlert | null {
        const threshold = this.getThreshold(product.id);

        if (product.stock <= 0 && this.settings.notifyOnZero) {
            return {
                id: `alert_${product.id}_${Date.now()}`,
                productId: product.id,
                productName: product.name,
                currentStock: product.stock,
                threshold,
                alertType: 'OUT_OF_STOCK',
                createdAt: new Date().toISOString(),
                acknowledged: false,
            };
        } else if (product.stock > 0 && product.stock <= threshold && this.settings.notifyOnLow) {
            return {
                id: `alert_${product.id}_${Date.now()}`,
                productId: product.id,
                productName: product.name,
                currentStock: product.stock,
                threshold,
                alertType: 'LOW_STOCK',
                createdAt: new Date().toISOString(),
                acknowledged: false,
            };
        }

        return null;
    }

    /**
     * Get low stock products
     */
    async getLowStockProducts(): Promise<{ product: Product; alert: StockAlert }[]> {
        const products = await StorageService.getProducts();
        const result: { product: Product; alert: StockAlert }[] = [];

        for (const product of products) {
            const alert = this.checkProductStock(product);
            if (alert) {
                result.push({ product, alert });
            }
        }

        // Sort by stock level (lowest first)
        result.sort((a, b) => a.product.stock - b.product.stock);

        return result;
    }

    /**
     * Get stock summary statistics
     */
    async getStockSummary(): Promise<{
        totalProducts: number;
        outOfStock: number;
        lowStock: number;
        healthyStock: number;
        totalStockValue: number;
    }> {
        const products = await StorageService.getProducts();

        let outOfStock = 0;
        let lowStock = 0;
        let healthyStock = 0;
        let totalStockValue = 0;

        for (const product of products) {
            const threshold = this.getThreshold(product.id);
            const stockValue = product.stock * (product.purchasePrice || product.price);
            totalStockValue += stockValue;

            if (product.stock <= 0) {
                outOfStock++;
            } else if (product.stock <= threshold) {
                lowStock++;
            } else {
                healthyStock++;
            }
        }

        return {
            totalProducts: products.length,
            outOfStock,
            lowStock,
            healthyStock,
            totalStockValue,
        };
    }

    /**
     * Send local notification for stock alerts
     */
    async sendNotification(alerts: StockAlert[]): Promise<void> {
        if (!Capacitor.isNativePlatform() || alerts.length === 0) return;

        try {
            const permission = await LocalNotifications.checkPermissions();
            if (permission.display !== 'granted') {
                await LocalNotifications.requestPermissions();
            }

            const outOfStock = alerts.filter(a => a.alertType === 'OUT_OF_STOCK');
            const lowStock = alerts.filter(a => a.alertType === 'LOW_STOCK');

            let title = '📦 Stock Alert';
            let body = '';

            if (outOfStock.length > 0 && lowStock.length > 0) {
                body = `${outOfStock.length} items out of stock, ${lowStock.length} items running low`;
            } else if (outOfStock.length > 0) {
                body = `${outOfStock.length} item${outOfStock.length > 1 ? 's' : ''} out of stock: ${outOfStock.slice(0, 2).map(a => a.productName).join(', ')}`;
            } else if (lowStock.length > 0) {
                body = `${lowStock.length} item${lowStock.length > 1 ? 's' : ''} running low: ${lowStock.slice(0, 2).map(a => a.productName).join(', ')}`;
            }

            await LocalNotifications.schedule({
                notifications: [{
                    id: Math.floor(Math.random() * 100000),
                    title,
                    body,
                    schedule: { at: new Date(Date.now() + 1000) },
                    sound: 'default',
                    smallIcon: 'ic_stat_icon_config_sample',
                    iconColor: '#EF4444',
                }],
            });

            console.log('[StockAlertService] Notification sent');
        } catch (error) {
            console.error('[StockAlertService] Failed to send notification:', error);
        }
    }

    /**
     * Acknowledge an alert
     */
    acknowledgeAlert(alertId: string): void {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
        }
    }

    /**
     * Get current alerts
     */
    getAlerts(): StockAlert[] {
        return this.alerts;
    }

    /**
     * Get unacknowledged alert count
     */
    getUnacknowledgedCount(): number {
        return this.alerts.filter(a => !a.acknowledged).length;
    }
}

// Export singleton instance
export const stockAlertService = new StockAlertService();
export default stockAlertService;
