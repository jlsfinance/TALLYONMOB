/**
 * Region Selector Component
 * Allows user to select their business region for proper tax handling
 * Includes auto-detection, warnings for region changes after company setup
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Globe, Check, ChevronRight, MapPin, Building2,
    IndianRupee, DollarSign, PoundSterling, AlertTriangle,
    Sparkles, Shield
} from 'lucide-react';
import { regionalTaxService, CountryCode, RegionChangeWarning } from '../services/regionalTaxService';

interface RegionSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect?: (region: CountryCode) => void;
}

// Flag emojis for countries
const COUNTRY_FLAGS: Record<CountryCode, string> = {
    IN: '🇮🇳',
    AE: '🇦🇪',
    US: '🇺🇸',
    GB: '🇬🇧',
    CA: '🇨🇦',
    AU: '🇦🇺',
    SG: '🇸🇬',
    SA: '🇸🇦',
    OTHER: '🌍',
};

// Currency icons
const getCurrencyIcon = (code: CountryCode) => {
    switch (code) {
        case 'IN':
            return <IndianRupee className="w-4 h-4" />;
        case 'US':
        case 'CA':
        case 'AU':
        case 'SG':
            return <DollarSign className="w-4 h-4" />;
        case 'GB':
            return <PoundSterling className="w-4 h-4" />;
        default:
            return <DollarSign className="w-4 h-4" />;
    }
};

// Region descriptions
const REGION_DESCRIPTIONS: Record<CountryCode, string> = {
    IN: 'GST with CGST/SGST (Intra-state) or IGST (Inter-state)',
    AE: 'VAT 5% standard rate',
    US: 'State-wise Sales Tax',
    GB: 'VAT with 0%, 5%, 20% rates',
    CA: 'GST/HST/PST based on province',
    AU: 'GST 10% standard rate',
    SG: 'GST 9% (2025)',
    SA: 'VAT 15% standard rate',
    OTHER: 'Custom tax configuration',
};

const RegionSelector: React.FC<RegionSelectorProps> = ({
    isOpen,
    onClose,
    onSelect,
}) => {
    const [selectedRegion, setSelectedRegion] = useState<CountryCode>(
        regionalTaxService.getRegion()
    );
    const [regions, setRegions] = useState<{ code: CountryCode; name: string; taxName: string }[]>([]);
    const [autoDetectedRegion, setAutoDetectedRegion] = useState<CountryCode | null>(null);
    const [detectionConfidence, setDetectionConfidence] = useState<'HIGH' | 'MEDIUM' | 'LOW' | null>(null);

    // Warning state
    const [pendingRegion, setPendingRegion] = useState<CountryCode | null>(null);
    const [warning, setWarning] = useState<RegionChangeWarning | null>(null);
    const [showWarningModal, setShowWarningModal] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setRegions(regionalTaxService.getAvailableRegions());
            setSelectedRegion(regionalTaxService.getRegion());

            // Auto-detect on first open
            handleAutoDetect();
        }
    }, [isOpen]);

    const handleAutoDetect = async () => {
        try {
            const detection = await regionalTaxService.autoDetectRegion();
            setAutoDetectedRegion(detection.detected);
            setDetectionConfidence(detection.confidence);
            console.log(`[RegionSelector] Auto-detected: ${detection.detected} (${detection.confidence})`);
        } catch (e) {
            console.warn('[RegionSelector] Auto-detection failed:', e);
        }
    };

    const handleSelect = (code: CountryCode) => {
        // Check if we need to show warning
        const changeWarning = regionalTaxService.getRegionChangeWarning(code);

        if (changeWarning && code !== selectedRegion) {
            // Show warning modal
            setPendingRegion(code);
            setWarning(changeWarning);
            setShowWarningModal(true);
        } else {
            // No warning needed, proceed directly
            confirmRegionChange(code);
        }
    };

    const confirmRegionChange = (code: CountryCode) => {
        setSelectedRegion(code);

        if (regionalTaxService.isLocked()) {
            // Use the confirmation method for locked regions
            regionalTaxService.changeRegionWithConfirmation(code);
        } else {
            regionalTaxService.setRegion(code);
        }

        onSelect?.(code);
        setShowWarningModal(false);
        setPendingRegion(null);
        setWarning(null);

        // Show success state briefly
        setTimeout(() => {
            onClose();
        }, 300);
    };

    const cancelRegionChange = () => {
        setShowWarningModal(false);
        setPendingRegion(null);
        setWarning(null);
    };

    const getWarningColor = (type: string) => {
        switch (type) {
            case 'CRITICAL':
                return {
                    bg: 'bg-red-50 dark:bg-red-900/20',
                    border: 'border-red-200 dark:border-red-800',
                    icon: 'text-red-500',
                    button: 'bg-red-500 hover:bg-red-600',
                };
            case 'WARNING':
                return {
                    bg: 'bg-amber-50 dark:bg-amber-900/20',
                    border: 'border-amber-200 dark:border-amber-800',
                    icon: 'text-amber-500',
                    button: 'bg-amber-500 hover:bg-amber-600',
                };
            default:
                return {
                    bg: 'bg-blue-50 dark:bg-blue-900/20',
                    border: 'border-blue-200 dark:border-blue-800',
                    icon: 'text-blue-500',
                    button: 'bg-blue-500 hover:bg-blue-600',
                };
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end justify-center">
                <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="bg-white dark:bg-slate-900 rounded-t-[32px] w-full max-w-lg overflow-hidden"
                >
                    {/* Header */}
                    <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 px-6 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-4" />
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                                    <Globe className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-slate-900 dark:text-white">Select Region</h2>
                                    <p className="text-xs text-slate-500">Configure tax rules for your country</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Auto-Detection Banner */}
                    {autoDetectedRegion && autoDetectedRegion !== selectedRegion && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mx-4 mt-4 p-4 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl text-white"
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <p className="font-bold text-sm">Auto-Detected: {COUNTRY_FLAGS[autoDetectedRegion]} {regionalTaxService.getAvailableRegions().find(r => r.code === autoDetectedRegion)?.name}</p>
                                    <p className="text-xs opacity-80 mt-0.5">
                                        {detectionConfidence === 'HIGH' ? 'Based on your timezone' :
                                            detectionConfidence === 'MEDIUM' ? 'Based on your language' :
                                                'Best guess'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleSelect(autoDetectedRegion)}
                                    className="px-4 py-2 bg-white text-emerald-600 rounded-xl text-xs font-bold"
                                >
                                    Use This
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* Current Selection Info */}
                    <div className="px-6 py-4 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                <span className="text-sm text-blue-700 dark:text-blue-300">
                                    Current: <strong>{COUNTRY_FLAGS[selectedRegion]} {regionalTaxService.getConfig().countryName}</strong> ({regionalTaxService.getTaxName()})
                                </span>
                            </div>
                            {regionalTaxService.isLocked() && (
                                <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                    <Shield className="w-3 h-3" />
                                    <span>Locked</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Region List */}
                    <div className="overflow-y-auto max-h-[50vh] pb-8">
                        <div className="p-4 space-y-2">
                            {regions.map((region) => {
                                const isSelected = selectedRegion === region.code;
                                const isAutoDetected = autoDetectedRegion === region.code;

                                return (
                                    <motion.button
                                        key={region.code}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => handleSelect(region.code)}
                                        className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${isSelected
                                            ? 'bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-500'
                                            : isAutoDetected
                                                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-300 dark:border-emerald-700'
                                                : 'bg-slate-50 dark:bg-slate-800 border-2 border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                                            }`}
                                    >
                                        {/* Flag */}
                                        <div className="text-3xl">
                                            {COUNTRY_FLAGS[region.code]}
                                        </div>

                                        {/* Details */}
                                        <div className="flex-1 text-left">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-900 dark:text-white">
                                                    {region.name}
                                                </span>
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isSelected
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                                                    }`}>
                                                    {region.taxName}
                                                </span>
                                                {isAutoDetected && !isSelected && (
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                                                        Detected
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                {REGION_DESCRIPTIONS[region.code]}
                                            </p>
                                            <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
                                                {getCurrencyIcon(region.code)}
                                                <span>{REGIONAL_CONFIGS[region.code]?.currency || 'USD'}</span>
                                            </div>
                                        </div>

                                        {/* Selection indicator */}
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isSelected
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-slate-200 dark:bg-slate-700'
                                            }`}>
                                            {isSelected ? (
                                                <Check className="w-4 h-4" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4 text-slate-400" />
                                            )}
                                        </div>
                                    </motion.button>
                                );
                            })}
                        </div>

                        {/* Info Note */}
                        <div className="px-6 py-4">
                            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 flex gap-3">
                                <Building2 className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs text-amber-800 dark:text-amber-300 font-bold">
                                        Important
                                    </p>
                                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                                        Changing your region will update tax rates, currency, and invoice format.
                                        Make sure to configure your Tax ID in Settings after changing region.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Warning Modal */}
                <AnimatePresence>
                    {showWarningModal && warning && pendingRegion && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[210] bg-black/70 flex items-center justify-center p-4"
                            onClick={cancelRegionChange}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Warning Header */}
                                <div className={`p-6 ${getWarningColor(warning.type).bg} border-b ${getWarningColor(warning.type).border}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-12 h-12 rounded-2xl ${warning.type === 'CRITICAL' ? 'bg-red-500' : warning.type === 'WARNING' ? 'bg-amber-500' : 'bg-blue-500'} flex items-center justify-center`}>
                                            <AlertTriangle className="w-6 h-6 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-slate-900 dark:text-white">
                                                {warning.title}
                                            </h3>
                                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                                {COUNTRY_FLAGS[selectedRegion]} → {COUNTRY_FLAGS[pendingRegion]}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Warning Content */}
                                <div className="p-6">
                                    <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">
                                        {warning.message}
                                    </p>

                                    {/* Impacts List */}
                                    <div className="space-y-2 mb-6">
                                        {warning.impacts.map((impact, idx) => (
                                            <div key={idx} className="flex items-start gap-2 text-sm">
                                                <span className="text-amber-500 mt-0.5">•</span>
                                                <span className="text-slate-600 dark:text-slate-400">{impact}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-3">
                                        <button
                                            onClick={cancelRegionChange}
                                            className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => confirmRegionChange(pendingRegion)}
                                            className={`flex-1 py-3 ${getWarningColor(warning.type).button} text-white rounded-xl font-bold`}
                                        >
                                            {warning.type === 'CRITICAL' ? 'Change Anyway' : 'Confirm Change'}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </AnimatePresence>
    );
};

// Import REGIONAL_CONFIGS for currency display
import { REGIONAL_CONFIGS } from '../services/regionalTaxService';

export default RegionSelector;
