/**
 * Stock Alerts Component
 * Shows low stock and out of stock warnings with management options
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, AlertTriangle, Package, Bell, BellOff,
    Settings, TrendingDown, ShoppingCart, Check,
    ChevronRight, RefreshCw
} from 'lucide-react';
import { stockAlertService, StockAlert, StockAlertSettings } from '../services/stockAlertService';
import { Product } from '../types';

interface StockAlertsProps {
    onClose: () => void;
    onNavigateToInventory?: () => void;
}

const StockAlerts: React.FC<StockAlertsProps> = ({ onClose, onNavigateToInventory }) => {
    const [lowStockItems, setLowStockItems] = useState<{ product: Product; alert: StockAlert }[]>([]);
    const [summary, setSummary] = useState({
        totalProducts: 0,
        outOfStock: 0,
        lowStock: 0,
        healthyStock: 0,
        totalStockValue: 0,
    });
    const [settings, setSettings] = useState<StockAlertSettings>(stockAlertService.getSettings());
    const [showSettings, setShowSettings] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const items = await stockAlertService.getLowStockProducts();
            const stockSummary = await stockAlertService.getStockSummary();
            setLowStockItems(items);
            setSummary(stockSummary);
        } catch (error) {
            console.error('Failed to load stock data:', error);
        }
        setLoading(false);
    };

    const handleSettingsChange = async (key: keyof StockAlertSettings, value: any) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        await stockAlertService.saveSettings(newSettings);
    };



    return (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end justify-center">
            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-white dark:bg-slate-900 rounded-t-[32px] w-full max-w-lg max-h-[90vh] overflow-hidden"
            >
                {/* Header */}
                <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 px-6 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-4" />
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                                <AlertTriangle className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-slate-900 dark:text-white">Stock Alerts</h2>
                                <p className="text-xs text-slate-500">
                                    {summary.outOfStock + summary.lowStock} items need attention
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                            >
                                <Settings className="w-5 h-5" />
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="overflow-y-auto max-h-[calc(90vh-100px)] pb-8">
                    {/* Summary Cards */}
                    <div className="p-4 grid grid-cols-3 gap-3">
                        <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-3 text-center border border-red-100 dark:border-red-800">
                            <p className="text-2xl font-black text-red-600 dark:text-red-400">{summary.outOfStock}</p>
                            <p className="text-[10px] font-bold text-red-600/70 uppercase tracking-wider">Out of Stock</p>
                        </div>
                        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-2xl p-3 text-center border border-orange-100 dark:border-orange-800">
                            <p className="text-2xl font-black text-orange-600 dark:text-orange-400">{summary.lowStock}</p>
                            <p className="text-[10px] font-bold text-orange-600/70 uppercase tracking-wider">Low Stock</p>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-3 text-center border border-emerald-100 dark:border-emerald-800">
                            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{summary.healthyStock}</p>
                            <p className="text-[10px] font-bold text-emerald-600/70 uppercase tracking-wider">Healthy</p>
                        </div>
                    </div>

                    {/* Settings Panel */}
                    <AnimatePresence>
                        {showSettings && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="mx-4 mb-4 bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 overflow-hidden"
                            >
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Alert Settings</h3>

                                <div className="space-y-3">
                                    {/* Enable Alerts */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {settings.enabled ? (
                                                <Bell className="w-4 h-4 text-blue-500" />
                                            ) : (
                                                <BellOff className="w-4 h-4 text-slate-400" />
                                            )}
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                Enable Notifications
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleSettingsChange('enabled', !settings.enabled)}
                                            className={`w-12 h-6 rounded-full transition-colors ${settings.enabled ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'
                                                }`}
                                        >
                                            <motion.div
                                                animate={{ x: settings.enabled ? 24 : 2 }}
                                                className="w-5 h-5 bg-white rounded-full shadow"
                                            />
                                        </button>
                                    </div>

                                    {/* Default Threshold */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Low Stock Threshold
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleSettingsChange('defaultThreshold', Math.max(1, settings.defaultThreshold - 5))}
                                                className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 font-bold"
                                            >
                                                -
                                            </button>
                                            <span className="w-12 text-center font-bold text-slate-900 dark:text-white">
                                                {settings.defaultThreshold}
                                            </span>
                                            <button
                                                onClick={() => handleSettingsChange('defaultThreshold', settings.defaultThreshold + 5)}
                                                className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 font-bold"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Low Stock Items List */}
                    <div className="px-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Items Needing Attention
                            </h3>
                            <button
                                onClick={loadData}
                                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
                            </div>
                        ) : lowStockItems.length === 0 ? (
                            <div className="text-center py-8">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                    <Check className="w-8 h-8 text-emerald-500" />
                                </div>
                                <p className="font-bold text-slate-900 dark:text-white mb-1">All Good! 🎉</p>
                                <p className="text-sm text-slate-500">All your products have healthy stock levels.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {lowStockItems.map(({ product, alert }) => (
                                    <motion.div
                                        key={product.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className={`flex items-center justify-between p-3 rounded-2xl border ${alert.alertType === 'OUT_OF_STOCK'
                                            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                            : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${alert.alertType === 'OUT_OF_STOCK'
                                                ? 'bg-red-500'
                                                : 'bg-orange-500'
                                                }`}>
                                                {alert.alertType === 'OUT_OF_STOCK' ? (
                                                    <Package className="w-5 h-5 text-white" />
                                                ) : (
                                                    <TrendingDown className="w-5 h-5 text-white" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-900 dark:text-white text-sm">
                                                    {product.name}
                                                </p>
                                                <p className={`text-xs font-medium ${alert.alertType === 'OUT_OF_STOCK'
                                                    ? 'text-red-600 dark:text-red-400'
                                                    : 'text-orange-600 dark:text-orange-400'
                                                    }`}>
                                                    {alert.alertType === 'OUT_OF_STOCK'
                                                        ? 'Out of Stock'
                                                        : `Only ${product.stock} left (min: ${alert.threshold})`
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-black text-slate-900 dark:text-white">
                                                {product.stock}
                                            </p>
                                            <p className="text-[10px] text-slate-500 uppercase">in stock</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Action Button */}
                    {onNavigateToInventory && lowStockItems.length > 0 && (
                        <div className="p-4 mt-4">
                            <button
                                onClick={onNavigateToInventory}
                                className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30"
                            >
                                <ShoppingCart className="w-4 h-4" />
                                Go to Inventory
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default StockAlerts;
