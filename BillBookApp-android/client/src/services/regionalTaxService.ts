/**
 * Regional Tax Service
 * Handles different tax systems based on country/region
 * 
 * Supported Regions:
 * - India (IN): GST (CGST, SGST, IGST)
 * - UAE (AE): VAT
 * - USA (US): Sales Tax
 * - UK (GB): VAT
 * - Canada (CA): GST/HST/PST
 * - Australia (AU): GST
 * - Singapore (SG): GST
 * - Saudi Arabia (SA): VAT
 */

export type CountryCode = 'IN' | 'AE' | 'US' | 'GB' | 'CA' | 'AU' | 'SG' | 'SA' | 'OTHER';

export interface TaxRate {
    id: string;
    name: string;
    rate: number;           // Percentage (e.g., 18 for 18%)
    type: 'INCLUSIVE' | 'EXCLUSIVE'; // Whether price includes tax
    description?: string;
}

export interface RegionalTaxConfig {
    countryCode: CountryCode;
    countryName: string;
    currency: string;
    currencySymbol: string;
    taxName: string;         // GST, VAT, Sales Tax
    taxIdLabel: string;      // GSTIN, TRN, EIN
    taxIdFormat?: RegExp;    // Validation pattern
    taxRates: TaxRate[];
    defaultRate?: number;
    hasStateTax?: boolean;   // For India (CGST+SGST vs IGST)
    stateTaxLabel?: string;  // e.g., "State"
    interStateTaxLabel?: string; // e.g., "Inter-State"
}

// India GST Configuration
const INDIA_CONFIG: RegionalTaxConfig = {
    countryCode: 'IN',
    countryName: 'India',
    currency: 'INR',
    currencySymbol: '₹',
    taxName: 'GST',
    taxIdLabel: 'GSTIN',
    taxIdFormat: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    hasStateTax: true,
    stateTaxLabel: 'Intra-state (CGST+SGST)',
    interStateTaxLabel: 'Inter-state (IGST)',
    taxRates: [
        { id: 'gst_0', name: 'GST 0%', rate: 0, type: 'EXCLUSIVE', description: 'Exempt / Nil rated' },
        { id: 'gst_5', name: 'GST 5%', rate: 5, type: 'EXCLUSIVE', description: 'Essential goods' },
        { id: 'gst_12', name: 'GST 12%', rate: 12, type: 'EXCLUSIVE', description: 'Standard goods' },
        { id: 'gst_18', name: 'GST 18%', rate: 18, type: 'EXCLUSIVE', description: 'Most services & goods' },
        { id: 'gst_28', name: 'GST 28%', rate: 28, type: 'EXCLUSIVE', description: 'Luxury items' },
    ],
    defaultRate: 18,
};

// UAE VAT Configuration
const UAE_CONFIG: RegionalTaxConfig = {
    countryCode: 'AE',
    countryName: 'United Arab Emirates',
    currency: 'AED',
    currencySymbol: 'د.إ',
    taxName: 'VAT',
    taxIdLabel: 'TRN',
    taxIdFormat: /^[0-9]{15}$/,
    taxRates: [
        { id: 'vat_0', name: 'VAT 0%', rate: 0, type: 'EXCLUSIVE', description: 'Zero-rated / Exempt' },
        { id: 'vat_5', name: 'VAT 5%', rate: 5, type: 'EXCLUSIVE', description: 'Standard rate' },
    ],
    defaultRate: 5,
};

// USA Sales Tax Configuration
const USA_CONFIG: RegionalTaxConfig = {
    countryCode: 'US',
    countryName: 'United States',
    currency: 'USD',
    currencySymbol: '$',
    taxName: 'Sales Tax',
    taxIdLabel: 'EIN',
    taxIdFormat: /^[0-9]{2}-[0-9]{7}$/,
    hasStateTax: true,
    stateTaxLabel: 'State Tax',
    taxRates: [
        { id: 'sales_0', name: 'No Tax', rate: 0, type: 'EXCLUSIVE', description: 'Tax Exempt' },
        { id: 'sales_5', name: 'Sales Tax 5%', rate: 5, type: 'EXCLUSIVE', description: 'Low rate states' },
        { id: 'sales_6', name: 'Sales Tax 6%', rate: 6, type: 'EXCLUSIVE', description: 'Standard states' },
        { id: 'sales_7', name: 'Sales Tax 7%', rate: 7, type: 'EXCLUSIVE', description: 'Higher rate states' },
        { id: 'sales_8', name: 'Sales Tax 8%', rate: 8, type: 'EXCLUSIVE', description: 'High rate states' },
        { id: 'sales_10', name: 'Sales Tax 10%', rate: 10, type: 'EXCLUSIVE', description: 'Highest rate (CA)' },
    ],
    defaultRate: 6,
};

// UK VAT Configuration
const UK_CONFIG: RegionalTaxConfig = {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    currency: 'GBP',
    currencySymbol: '£',
    taxName: 'VAT',
    taxIdLabel: 'VAT Number',
    taxIdFormat: /^GB[0-9]{9}$/,
    taxRates: [
        { id: 'vat_0', name: 'VAT 0%', rate: 0, type: 'EXCLUSIVE', description: 'Zero-rated' },
        { id: 'vat_5', name: 'VAT 5%', rate: 5, type: 'EXCLUSIVE', description: 'Reduced rate' },
        { id: 'vat_20', name: 'VAT 20%', rate: 20, type: 'EXCLUSIVE', description: 'Standard rate' },
    ],
    defaultRate: 20,
};

// Canada GST/HST Configuration
const CANADA_CONFIG: RegionalTaxConfig = {
    countryCode: 'CA',
    countryName: 'Canada',
    currency: 'CAD',
    currencySymbol: 'CA$',
    taxName: 'GST/HST',
    taxIdLabel: 'GST/HST Number',
    taxIdFormat: /^[0-9]{9}RT[0-9]{4}$/,
    hasStateTax: true,
    stateTaxLabel: 'Provincial Tax (PST)',
    taxRates: [
        { id: 'gst_0', name: 'GST 0%', rate: 0, type: 'EXCLUSIVE', description: 'Zero-rated' },
        { id: 'gst_5', name: 'GST 5%', rate: 5, type: 'EXCLUSIVE', description: 'Federal GST only' },
        { id: 'hst_13', name: 'HST 13%', rate: 13, type: 'EXCLUSIVE', description: 'HST (Ontario)' },
        { id: 'hst_15', name: 'HST 15%', rate: 15, type: 'EXCLUSIVE', description: 'HST (NS, NB, NL)' },
    ],
    defaultRate: 5,
};

// Australia GST Configuration
const AUSTRALIA_CONFIG: RegionalTaxConfig = {
    countryCode: 'AU',
    countryName: 'Australia',
    currency: 'AUD',
    currencySymbol: 'A$',
    taxName: 'GST',
    taxIdLabel: 'ABN',
    taxIdFormat: /^[0-9]{11}$/,
    taxRates: [
        { id: 'gst_0', name: 'GST-Free', rate: 0, type: 'EXCLUSIVE', description: 'GST-Free supplies' },
        { id: 'gst_10', name: 'GST 10%', rate: 10, type: 'EXCLUSIVE', description: 'Standard rate' },
    ],
    defaultRate: 10,
};

// Singapore GST Configuration  
const SINGAPORE_CONFIG: RegionalTaxConfig = {
    countryCode: 'SG',
    countryName: 'Singapore',
    currency: 'SGD',
    currencySymbol: 'S$',
    taxName: 'GST',
    taxIdLabel: 'GST Reg No.',
    taxIdFormat: /^[A-Z][0-9]{8}[A-Z]$/,
    taxRates: [
        { id: 'gst_0', name: 'GST 0%', rate: 0, type: 'EXCLUSIVE', description: 'Zero-rated / Exempt' },
        { id: 'gst_8', name: 'GST 8%', rate: 8, type: 'EXCLUSIVE', description: 'Standard rate (2024)' },
        { id: 'gst_9', name: 'GST 9%', rate: 9, type: 'EXCLUSIVE', description: 'Standard rate (2025+)' },
    ],
    defaultRate: 9,
};

// Saudi Arabia VAT Configuration
const SAUDI_CONFIG: RegionalTaxConfig = {
    countryCode: 'SA',
    countryName: 'Saudi Arabia',
    currency: 'SAR',
    currencySymbol: '﷼',
    taxName: 'VAT',
    taxIdLabel: 'VAT Number',
    taxRates: [
        { id: 'vat_0', name: 'VAT 0%', rate: 0, type: 'EXCLUSIVE', description: 'Zero-rated / Exempt' },
        { id: 'vat_15', name: 'VAT 15%', rate: 15, type: 'EXCLUSIVE', description: 'Standard rate' },
    ],
    defaultRate: 15,
};

// Other/Custom Configuration
const OTHER_CONFIG: RegionalTaxConfig = {
    countryCode: 'OTHER',
    countryName: 'Other',
    currency: 'USD',
    currencySymbol: '$',
    taxName: 'Tax',
    taxIdLabel: 'Tax ID',
    taxRates: [
        { id: 'tax_0', name: 'No Tax', rate: 0, type: 'EXCLUSIVE' },
        { id: 'tax_5', name: 'Tax 5%', rate: 5, type: 'EXCLUSIVE' },
        { id: 'tax_10', name: 'Tax 10%', rate: 10, type: 'EXCLUSIVE' },
        { id: 'tax_15', name: 'Tax 15%', rate: 15, type: 'EXCLUSIVE' },
        { id: 'tax_18', name: 'Tax 18%', rate: 18, type: 'EXCLUSIVE' },
        { id: 'tax_20', name: 'Tax 20%', rate: 20, type: 'EXCLUSIVE' },
    ],
    defaultRate: 0,
};

// All Configurations Map
const REGIONAL_CONFIGS: Record<CountryCode, RegionalTaxConfig> = {
    IN: INDIA_CONFIG,
    AE: UAE_CONFIG,
    US: USA_CONFIG,
    GB: UK_CONFIG,
    CA: CANADA_CONFIG,
    AU: AUSTRALIA_CONFIG,
    SG: SINGAPORE_CONFIG,
    SA: SAUDI_CONFIG,
    OTHER: OTHER_CONFIG,
};

// Indian State Codes for GST
export const INDIAN_STATE_CODES: Record<string, string> = {
    '01': 'Jammu & Kashmir',
    '02': 'Himachal Pradesh',
    '03': 'Punjab',
    '04': 'Chandigarh',
    '05': 'Uttarakhand',
    '06': 'Haryana',
    '07': 'Delhi',
    '08': 'Rajasthan',
    '09': 'Uttar Pradesh',
    '10': 'Bihar',
    '11': 'Sikkim',
    '12': 'Arunachal Pradesh',
    '13': 'Nagaland',
    '14': 'Manipur',
    '15': 'Mizoram',
    '16': 'Tripura',
    '17': 'Meghalaya',
    '18': 'Assam',
    '19': 'West Bengal',
    '20': 'Jharkhand',
    '21': 'Odisha',
    '22': 'Chhattisgarh',
    '23': 'Madhya Pradesh',
    '24': 'Gujarat',
    '26': 'Dadra & Nagar Haveli and Daman & Diu',
    '27': 'Maharashtra',
    '28': 'Andhra Pradesh (Old)',
    '29': 'Karnataka',
    '30': 'Goa',
    '31': 'Lakshadweep',
    '32': 'Kerala',
    '33': 'Tamil Nadu',
    '34': 'Puducherry',
    '35': 'Andaman & Nicobar Islands',
    '36': 'Telangana',
    '37': 'Andhra Pradesh',
    '38': 'Ladakh',
};

// Timezone to Country mapping for auto-detection
const TIMEZONE_TO_COUNTRY: Record<string, CountryCode> = {
    // India
    'Asia/Kolkata': 'IN',
    'Asia/Calcutta': 'IN',
    // UAE
    'Asia/Dubai': 'AE',
    'Asia/Abu_Dhabi': 'AE',
    // USA
    'America/New_York': 'US',
    'America/Los_Angeles': 'US',
    'America/Chicago': 'US',
    'America/Denver': 'US',
    'America/Phoenix': 'US',
    'America/Anchorage': 'US',
    'Pacific/Honolulu': 'US',
    // UK
    'Europe/London': 'GB',
    // Canada
    'America/Toronto': 'CA',
    'America/Vancouver': 'CA',
    'America/Montreal': 'CA',
    // Australia
    'Australia/Sydney': 'AU',
    'Australia/Melbourne': 'AU',
    'Australia/Perth': 'AU',
    'Australia/Brisbane': 'AU',
    // Singapore
    'Asia/Singapore': 'SG',
    // Saudi Arabia
    'Asia/Riyadh': 'SA',
};

export interface RegionChangeWarning {
    type: 'INFO' | 'WARNING' | 'CRITICAL';
    title: string;
    message: string;
    impacts: string[];
}

class RegionalTaxService {
    private currentRegion: CountryCode = 'IN'; // Default to India
    private currentConfig: RegionalTaxConfig = INDIA_CONFIG;
    private isRegionLocked: boolean = false; // True after company is created
    private hasExistingData: boolean = false;
    private _regionSetAt: string | null = null;

    constructor() {
        this.loadRegion();
    }

    /**
     * Load region from storage
     */
    private loadRegion(): void {
        try {
            const saved = localStorage.getItem('business_region');
            const lockedStatus = localStorage.getItem('region_locked');
            const setAt = localStorage.getItem('region_set_at');
            const hasData = localStorage.getItem('has_business_data');

            if (saved && saved in REGIONAL_CONFIGS) {
                this.currentRegion = saved as CountryCode;
                this.currentConfig = REGIONAL_CONFIGS[this.currentRegion];
            }

            this.isRegionLocked = lockedStatus === 'true';
            this._regionSetAt = setAt;
            this.hasExistingData = hasData === 'true';
        } catch {
            console.warn('[RegionalTaxService] Failed to load region');
        }
    }

    /**
     * Auto-detect region based on timezone, locale, and geolocation
     */
    async autoDetectRegion(): Promise<{
        detected: CountryCode;
        confidence: 'HIGH' | 'MEDIUM' | 'LOW';
        method: string;
    }> {
        // Method 1: Timezone detection (most reliable)
        try {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            console.log(`[RegionalTaxService] Detected timezone: ${timezone}`);

            if (timezone && TIMEZONE_TO_COUNTRY[timezone]) {
                return {
                    detected: TIMEZONE_TO_COUNTRY[timezone],
                    confidence: 'HIGH',
                    method: 'timezone',
                };
            }
        } catch (e) {
            console.warn('[RegionalTaxService] Timezone detection failed:', e);
        }

        // Method 2: Browser locale detection
        try {
            const locale = navigator.language || (navigator as any).userLanguage;
            console.log(`[RegionalTaxService] Detected locale: ${locale}`);

            const localeToCountry: Record<string, CountryCode> = {
                'en-IN': 'IN',
                'hi-IN': 'IN',
                'hi': 'IN',
                'ar-AE': 'AE',
                'en-AE': 'AE',
                'en-US': 'US',
                'en-GB': 'GB',
                'en-CA': 'CA',
                'fr-CA': 'CA',
                'en-AU': 'AU',
                'en-SG': 'SG',
                'ar-SA': 'SA',
            };

            if (locale && localeToCountry[locale]) {
                return {
                    detected: localeToCountry[locale],
                    confidence: 'MEDIUM',
                    method: 'locale',
                };
            }

            // Try partial match (e.g., 'en' from 'en-US')
            const baseLang = locale?.split('-')[0];
            if (baseLang === 'hi') {
                return { detected: 'IN', confidence: 'MEDIUM', method: 'locale-partial' };
            }
            if (baseLang === 'ar') {
                return { detected: 'AE', confidence: 'LOW', method: 'locale-partial' };
            }
        } catch (e) {
            console.warn('[RegionalTaxService] Locale detection failed:', e);
        }

        // Method 3: Geolocation API (requires permission)
        // We skip this to avoid permission prompts, but structure is here if needed

        // Default fallback
        return {
            detected: 'IN',
            confidence: 'LOW',
            method: 'default',
        };
    }

    /**
     * Initialize region - auto-detect if not set before
     */
    async initializeRegion(): Promise<CountryCode> {
        // If region already saved, use it
        const saved = localStorage.getItem('business_region');
        if (saved && saved in REGIONAL_CONFIGS) {
            console.log(`[RegionalTaxService] Using saved region: ${saved}`);
            return saved as CountryCode;
        }

        // Auto-detect
        const detection = await this.autoDetectRegion();
        console.log(`[RegionalTaxService] Auto-detected: ${detection.detected} (${detection.confidence} confidence via ${detection.method})`);

        this.setRegion(detection.detected);
        return detection.detected;
    }

    /**
     * Set business region
     */
    setRegion(countryCode: CountryCode): void {
        this.currentRegion = countryCode;
        this.currentConfig = REGIONAL_CONFIGS[countryCode];
        localStorage.setItem('business_region', countryCode);
        localStorage.setItem('region_set_at', new Date().toISOString());
        console.log(`[RegionalTaxService] Region set to: ${this.currentConfig.countryName}`);
    }

    /**
     * Lock region after company creation (call this when company is created)
     */
    lockRegion(): void {
        this.isRegionLocked = true;
        localStorage.setItem('region_locked', 'true');
        console.log('[RegionalTaxService] Region locked');
    }

    /**
     * Mark that business has existing data
     */
    setHasExistingData(hasData: boolean): void {
        this.hasExistingData = hasData;
        localStorage.setItem('has_business_data', hasData ? 'true' : 'false');
    }

    /**
     * Get when the region was set
     */
    getRegionSetAt(): string | null {
        return this._regionSetAt;
    }

    /**
     * Check if region is locked
     */
    isLocked(): boolean {
        return this.isRegionLocked;
    }

    /**
     * Check if changing region is safe
     */
    canChangeRegionSafely(): boolean {
        return !this.isRegionLocked && !this.hasExistingData;
    }

    /**
     * Get warning for region change
     */
    getRegionChangeWarning(newRegion: CountryCode): RegionChangeWarning | null {
        if (!this.isRegionLocked && !this.hasExistingData) {
            return null; // No warning needed
        }

        const oldConfig = this.currentConfig;
        const newConfig = REGIONAL_CONFIGS[newRegion];

        const impacts: string[] = [];

        // Check currency change
        if (oldConfig.currency !== newConfig.currency) {
            impacts.push(`Currency will change from ${oldConfig.currencySymbol} (${oldConfig.currency}) to ${newConfig.currencySymbol} (${newConfig.currency})`);
        }

        // Check tax system change
        if (oldConfig.taxName !== newConfig.taxName) {
            impacts.push(`Tax system will change from ${oldConfig.taxName} to ${newConfig.taxName}`);
        }

        // Check tax ID format change
        if (oldConfig.taxIdLabel !== newConfig.taxIdLabel) {
            impacts.push(`Tax ID label will change from ${oldConfig.taxIdLabel} to ${newConfig.taxIdLabel}`);
        }

        // Determine severity
        if (this.hasExistingData) {
            return {
                type: 'CRITICAL',
                title: '⚠️ Critical Warning',
                message: 'You have existing invoices and data. Changing region may cause inconsistencies in tax calculations and reports.',
                impacts: [
                    ...impacts,
                    'Existing invoices will keep old tax calculations',
                    'Reports may show mixed currency/tax data',
                    'GST/VAT numbers may become invalid',
                    'You may need to reconfigure tax settings',
                ],
            };
        }

        if (this.isRegionLocked) {
            return {
                type: 'WARNING',
                title: '⚡ Region Change Warning',
                message: 'Your company is already set up. Changing region will affect future invoices.',
                impacts: [
                    ...impacts,
                    'New invoices will use the new tax system',
                    'Update your Tax ID in settings',
                ],
            };
        }

        return {
            type: 'INFO',
            title: 'ℹ️ Region Change',
            message: 'You are changing your business region.',
            impacts,
        };
    }

    /**
     * Change region with confirmation (use after user confirms warning)
     */
    changeRegionWithConfirmation(newRegion: CountryCode): { success: boolean; previousRegion: CountryCode } {
        const previousRegion = this.currentRegion;

        // Log the change for audit
        console.log(`[RegionalTaxService] Region changed from ${previousRegion} to ${newRegion} at ${new Date().toISOString()}`);

        // Store change history
        try {
            const history = JSON.parse(localStorage.getItem('region_change_history') || '[]');
            history.push({
                from: previousRegion,
                to: newRegion,
                timestamp: new Date().toISOString(),
            });
            localStorage.setItem('region_change_history', JSON.stringify(history));
        } catch {
            // Ignore storage errors
        }

        this.setRegion(newRegion);

        return { success: true, previousRegion };
    }

    /**
     * Get region change history
     */
    getRegionChangeHistory(): Array<{ from: CountryCode; to: CountryCode; timestamp: string }> {
        try {
            return JSON.parse(localStorage.getItem('region_change_history') || '[]');
        } catch {
            return [];
        }
    }

    /**
     * Get current region
     */
    getRegion(): CountryCode {
        return this.currentRegion;
    }

    /**
     * Get current tax configuration
     */
    getConfig(): RegionalTaxConfig {
        return this.currentConfig;
    }

    /**
     * Get all available regions
     */
    getAvailableRegions(): { code: CountryCode; name: string; taxName: string }[] {
        return Object.entries(REGIONAL_CONFIGS).map(([code, config]) => ({
            code: code as CountryCode,
            name: config.countryName,
            taxName: config.taxName,
        }));
    }

    /**
     * Get tax rates for current region
     */
    getTaxRates(): TaxRate[] {
        return this.currentConfig.taxRates;
    }

    /**
     * Get default tax rate
     */
    getDefaultTaxRate(): number {
        return this.currentConfig.defaultRate || 0;
    }

    /**
     * Get tax name (GST, VAT, Sales Tax)
     */
    getTaxName(): string {
        return this.currentConfig.taxName;
    }

    /**
     * Get tax ID label (GSTIN, TRN, EIN)
     */
    getTaxIdLabel(): string {
        return this.currentConfig.taxIdLabel;
    }

    /**
     * Validate tax ID format
     */
    validateTaxId(taxId: string): boolean {
        if (!this.currentConfig.taxIdFormat) return true;
        return this.currentConfig.taxIdFormat.test(taxId);
    }

    /**
     * Get currency symbol
     */
    getCurrencySymbol(): string {
        return this.currentConfig.currencySymbol;
    }

    /**
     * Get currency code
     */
    getCurrency(): string {
        return this.currentConfig.currency;
    }

    /**
     * Format currency amount
     */
    formatCurrency(amount: number): string {
        const formatter = new Intl.NumberFormat(this.getLocale(), {
            style: 'currency',
            currency: this.currentConfig.currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        return formatter.format(amount);
    }

    /**
     * Get locale for formatting
     */
    getLocale(): string {
        const locales: Record<CountryCode, string> = {
            IN: 'en-IN',
            AE: 'ar-AE',
            US: 'en-US',
            GB: 'en-GB',
            CA: 'en-CA',
            AU: 'en-AU',
            SG: 'en-SG',
            SA: 'ar-SA',
            OTHER: 'en-US',
        };
        return locales[this.currentRegion];
    }

    /**
     * Calculate tax amount
     */
    calculateTax(amount: number, taxRate: number, type: 'INCLUSIVE' | 'EXCLUSIVE' = 'EXCLUSIVE'): {
        baseAmount: number;
        taxAmount: number;
        totalAmount: number;
    } {
        if (type === 'INCLUSIVE') {
            // Tax is included in the amount
            const baseAmount = amount / (1 + (taxRate / 100));
            const taxAmount = amount - baseAmount;
            return {
                baseAmount: Math.round(baseAmount * 100) / 100,
                taxAmount: Math.round(taxAmount * 100) / 100,
                totalAmount: amount,
            };
        } else {
            // Tax is exclusive (added on top)
            const taxAmount = amount * (taxRate / 100);
            return {
                baseAmount: amount,
                taxAmount: Math.round(taxAmount * 100) / 100,
                totalAmount: Math.round((amount + taxAmount) * 100) / 100,
            };
        }
    }

    /**
     * Calculate CGST/SGST split for India (Intra-state)
     */
    calculateIndiaCGSTSGST(amount: number, gstRate: number): {
        cgst: number;
        sgst: number;
        total: number;
    } {
        if (this.currentRegion !== 'IN') {
            return { cgst: 0, sgst: 0, total: 0 };
        }

        const halfRate = gstRate / 2;
        const cgst = Math.round((amount * halfRate / 100) * 100) / 100;
        const sgst = Math.round((amount * halfRate / 100) * 100) / 100;

        return {
            cgst,
            sgst,
            total: cgst + sgst,
        };
    }

    /**
     * Calculate IGST for India (Inter-state)
     */
    calculateIndiaIGST(amount: number, gstRate: number): {
        igst: number;
    } {
        if (this.currentRegion !== 'IN') {
            return { igst: 0 };
        }

        return {
            igst: Math.round((amount * gstRate / 100) * 100) / 100,
        };
    }

    /**
     * Check if inter-state transaction (India)
     */
    isInterState(sellerStateCode: string, buyerStateCode: string): boolean {
        if (this.currentRegion !== 'IN') return false;
        return sellerStateCode !== buyerStateCode;
    }

    /**
     * Get state code from GSTIN (India)
     */
    getStateFromGSTIN(gstin: string): { code: string; name: string } | null {
        if (this.currentRegion !== 'IN' || !gstin || gstin.length < 2) {
            return null;
        }

        const stateCode = gstin.substring(0, 2);
        const stateName = INDIAN_STATE_CODES[stateCode];

        if (stateName) {
            return { code: stateCode, name: stateName };
        }
        return null;
    }

    /**
     * Check if region has state-level tax
     */
    hasStateTax(): boolean {
        return this.currentConfig.hasStateTax || false;
    }

    /**
     * Get tax breakdown label
     */
    getTaxBreakdownLabels(): { primary: string; secondary?: string } {
        if (this.currentRegion === 'IN') {
            return {
                primary: 'CGST + SGST (Intra-State)',
                secondary: 'IGST (Inter-State)',
            };
        }
        return {
            primary: this.currentConfig.taxName,
        };
    }
}

// Export singleton instance
export const regionalTaxService = new RegionalTaxService();
export default regionalTaxService;

// Export configs for direct access
export { REGIONAL_CONFIGS, INDIA_CONFIG, UAE_CONFIG, USA_CONFIG, TIMEZONE_TO_COUNTRY };

