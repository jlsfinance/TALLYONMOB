/**
 * Internationalization (i18n) Service
 * Supports Hindi, English, and Hinglish translations for the app UI
 */

export type AppLanguage = 'en' | 'hi' | 'hinglish';

// Translation keys
export interface Translations {
    // Common
    app_name: string;
    dashboard: string;
    settings: string;
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    add: string;
    search: string;
    loading: string;
    success: string;
    error: string;
    confirm: string;
    back: string;
    next: string;
    done: string;
    close: string;
    share: string;
    download: string;
    print: string;

    // Dashboard
    total_revenue: string;
    total_sales: string;
    pending_amount: string;
    you_will_get: string;
    you_will_give: string;
    stock_value: string;
    cash_received: string;
    recent_transactions: string;
    view_all: string;
    add_transaction: string;

    // Invoice
    invoice: string;
    invoices: string;
    create_invoice: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    customer: string;
    items: string;
    add_item: string;
    quantity: string;
    rate: string;
    amount: string;
    subtotal: string;
    discount: string;
    tax: string;
    total: string;
    paid: string;
    pending: string;
    payment_received: string;
    balance_due: string;

    // Customer
    customers: string;
    add_customer: string;
    customer_name: string;
    phone: string;
    email: string;
    address: string;
    company_name: string;
    gstin: string;

    // Inventory
    inventory: string;
    products: string;
    add_product: string;
    product_name: string;
    price: string;
    stock: string;
    low_stock: string;
    out_of_stock: string;

    // Reports
    reports: string;
    sales_report: string;
    gst_report: string;
    profit_loss: string;
    customer_analytics: string;
    export_pdf: string;
    export_excel: string;

    // Payments
    payments: string;
    payment_in: string;
    payment_out: string;
    payment_mode: string;
    cash: string;
    upi: string;
    bank_transfer: string;
    cheque: string;

    // Settings
    business_profile: string;
    invoice_settings: string;
    language: string;
    theme: string;
    dark_mode: string;
    light_mode: string;
    backup: string;
    restore: string;

    // Alerts
    stock_alert: string;
    payment_reminder: string;

    // WhatsApp
    send_on_whatsapp: string;
    share_invoice: string;
    payment_link: string;
}

// English translations
const en: Translations = {
    app_name: 'JLS BillBook',
    dashboard: 'Dashboard',
    settings: 'Settings',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    search: 'Search',
    loading: 'Loading...',
    success: 'Success',
    error: 'Error',
    confirm: 'Confirm',
    back: 'Back',
    next: 'Next',
    done: 'Done',
    close: 'Close',
    share: 'Share',
    download: 'Download',
    print: 'Print',

    total_revenue: 'Total Revenue',
    total_sales: 'Total Sales',
    pending_amount: 'Pending Amount',
    you_will_get: "You'll Get",
    you_will_give: "You'll Give",
    stock_value: 'Stock Value',
    cash_received: 'Cash Received',
    recent_transactions: 'Recent Transactions',
    view_all: 'View All',
    add_transaction: 'Add Transaction',

    invoice: 'Invoice',
    invoices: 'Invoices',
    create_invoice: 'Create Invoice',
    invoice_number: 'Invoice Number',
    invoice_date: 'Invoice Date',
    due_date: 'Due Date',
    customer: 'Customer',
    items: 'Items',
    add_item: 'Add Item',
    quantity: 'Quantity',
    rate: 'Rate',
    amount: 'Amount',
    subtotal: 'Subtotal',
    discount: 'Discount',
    tax: 'Tax',
    total: 'Total',
    paid: 'Paid',
    pending: 'Pending',
    payment_received: 'Payment Received',
    balance_due: 'Balance Due',

    customers: 'Customers',
    add_customer: 'Add Customer',
    customer_name: 'Customer Name',
    phone: 'Phone',
    email: 'Email',
    address: 'Address',
    company_name: 'Company Name',
    gstin: 'GSTIN',

    inventory: 'Inventory',
    products: 'Products',
    add_product: 'Add Product',
    product_name: 'Product Name',
    price: 'Price',
    stock: 'Stock',
    low_stock: 'Low Stock',
    out_of_stock: 'Out of Stock',

    reports: 'Reports',
    sales_report: 'Sales Report',
    gst_report: 'GST Report',
    profit_loss: 'Profit & Loss',
    customer_analytics: 'Customer Analytics',
    export_pdf: 'Export PDF',
    export_excel: 'Export Excel',

    payments: 'Payments',
    payment_in: 'Payment In',
    payment_out: 'Payment Out',
    payment_mode: 'Payment Mode',
    cash: 'Cash',
    upi: 'UPI',
    bank_transfer: 'Bank Transfer',
    cheque: 'Cheque',

    business_profile: 'Business Profile',
    invoice_settings: 'Invoice Settings',
    language: 'Language',
    theme: 'Theme',
    dark_mode: 'Dark Mode',
    light_mode: 'Light Mode',
    backup: 'Backup',
    restore: 'Restore',

    stock_alert: 'Stock Alert',
    payment_reminder: 'Payment Reminder',

    send_on_whatsapp: 'Send on WhatsApp',
    share_invoice: 'Share Invoice',
    payment_link: 'Payment Link',
};

// Hindi translations
const hi: Translations = {
    app_name: 'JLS बिलबुक',
    dashboard: 'डैशबोर्ड',
    settings: 'सेटिंग्स',
    save: 'सहेजें',
    cancel: 'रद्द करें',
    delete: 'हटाएं',
    edit: 'संपादित करें',
    add: 'जोड़ें',
    search: 'खोजें',
    loading: 'लोड हो रहा है...',
    success: 'सफल',
    error: 'त्रुटि',
    confirm: 'पुष्टि करें',
    back: 'वापस',
    next: 'अगला',
    done: 'हो गया',
    close: 'बंद करें',
    share: 'शेयर करें',
    download: 'डाउनलोड',
    print: 'प्रिंट',

    total_revenue: 'कुल आय',
    total_sales: 'कुल बिक्री',
    pending_amount: 'बकाया राशि',
    you_will_get: 'आपको मिलेगा',
    you_will_give: 'आपको देना है',
    stock_value: 'स्टॉक मूल्य',
    cash_received: 'नकद प्राप्त',
    recent_transactions: 'हाल के लेनदेन',
    view_all: 'सभी देखें',
    add_transaction: 'लेनदेन जोड़ें',

    invoice: 'बिल',
    invoices: 'बिल',
    create_invoice: 'बिल बनाएं',
    invoice_number: 'बिल नंबर',
    invoice_date: 'बिल की तारीख',
    due_date: 'देय तिथि',
    customer: 'ग्राहक',
    items: 'आइटम',
    add_item: 'आइटम जोड़ें',
    quantity: 'मात्रा',
    rate: 'दर',
    amount: 'राशि',
    subtotal: 'उप-योग',
    discount: 'छूट',
    tax: 'कर (GST)',
    total: 'कुल',
    paid: 'भुगतान हो गया',
    pending: 'बकाया',
    payment_received: 'भुगतान प्राप्त',
    balance_due: 'शेष राशि',

    customers: 'ग्राहक',
    add_customer: 'ग्राहक जोड़ें',
    customer_name: 'ग्राहक का नाम',
    phone: 'फोन',
    email: 'ईमेल',
    address: 'पता',
    company_name: 'कंपनी का नाम',
    gstin: 'जीएसटीआईएन',

    inventory: 'इन्वेंटरी',
    products: 'उत्पाद',
    add_product: 'उत्पाद जोड़ें',
    product_name: 'उत्पाद का नाम',
    price: 'कीमत',
    stock: 'स्टॉक',
    low_stock: 'कम स्टॉक',
    out_of_stock: 'स्टॉक खत्म',

    reports: 'रिपोर्ट',
    sales_report: 'बिक्री रिपोर्ट',
    gst_report: 'GST रिपोर्ट',
    profit_loss: 'लाभ और हानि',
    customer_analytics: 'ग्राहक विश्लेषण',
    export_pdf: 'PDF निर्यात करें',
    export_excel: 'Excel निर्यात करें',

    payments: 'भुगतान',
    payment_in: 'भुगतान प्राप्त',
    payment_out: 'भुगतान किया',
    payment_mode: 'भुगतान विधि',
    cash: 'नकद',
    upi: 'UPI',
    bank_transfer: 'बैंक ट्रांसफर',
    cheque: 'चेक',

    business_profile: 'व्यापार प्रोफ़ाइल',
    invoice_settings: 'बिल सेटिंग्स',
    language: 'भाषा',
    theme: 'थीम',
    dark_mode: 'डार्क मोड',
    light_mode: 'लाइट मोड',
    backup: 'बैकअप',
    restore: 'पुनर्स्थापित करें',

    stock_alert: 'स्टॉक अलर्ट',
    payment_reminder: 'भुगतान रिमाइंडर',

    send_on_whatsapp: 'WhatsApp पर भेजें',
    share_invoice: 'बिल शेयर करें',
    payment_link: 'पेमेंट लिंक',
};

// Hinglish translations (Mix of Hindi and English)
const hinglish: Translations = {
    app_name: 'JLS BillBook',
    dashboard: 'Dashboard',
    settings: 'Settings',
    save: 'Save Karo',
    cancel: 'Cancel',
    delete: 'Delete Karo',
    edit: 'Edit Karo',
    add: 'Add Karo',
    search: 'Search Karo',
    loading: 'Loading...',
    success: 'Ho Gaya!',
    error: 'Error Aa Gaya',
    confirm: 'Confirm Karo',
    back: 'Wapas',
    next: 'Aage',
    done: 'Done',
    close: 'Band Karo',
    share: 'Share Karo',
    download: 'Download',
    print: 'Print',

    total_revenue: 'Total Kamai',
    total_sales: 'Total Sale',
    pending_amount: 'Pending Amount',
    you_will_get: 'Aapko Milega',
    you_will_give: 'Aapko Dena Hai',
    stock_value: 'Stock Value',
    cash_received: 'Cash Mila',
    recent_transactions: 'Latest Transactions',
    view_all: 'Sab Dekho',
    add_transaction: 'Transaction Add Karo',

    invoice: 'Bill',
    invoices: 'Bills',
    create_invoice: 'Naya Bill Banao',
    invoice_number: 'Bill Number',
    invoice_date: 'Bill Date',
    due_date: 'Due Date',
    customer: 'Customer',
    items: 'Items',
    add_item: 'Item Add Karo',
    quantity: 'Quantity',
    rate: 'Rate',
    amount: 'Amount',
    subtotal: 'Subtotal',
    discount: 'Discount',
    tax: 'Tax (GST)',
    total: 'Total',
    paid: 'Paid',
    pending: 'Pending',
    payment_received: 'Payment Mila',
    balance_due: 'Baaki Amount',

    customers: 'Customers',
    add_customer: 'Customer Add Karo',
    customer_name: 'Customer Naam',
    phone: 'Phone',
    email: 'Email',
    address: 'Address',
    company_name: 'Company Naam',
    gstin: 'GSTIN',

    inventory: 'Inventory',
    products: 'Products',
    add_product: 'Product Add Karo',
    product_name: 'Product Naam',
    price: 'Price',
    stock: 'Stock',
    low_stock: 'Stock Kam Hai',
    out_of_stock: 'Stock Khatam',

    reports: 'Reports',
    sales_report: 'Sales Report',
    gst_report: 'GST Report',
    profit_loss: 'Profit Loss',
    customer_analytics: 'Customer Analytics',
    export_pdf: 'PDF Banao',
    export_excel: 'Excel Banao',

    payments: 'Payments',
    payment_in: 'Payment Mila',
    payment_out: 'Payment Diya',
    payment_mode: 'Payment Mode',
    cash: 'Cash',
    upi: 'UPI',
    bank_transfer: 'Bank Transfer',
    cheque: 'Cheque',

    business_profile: 'Business Profile',
    invoice_settings: 'Bill Settings',
    language: 'Bhasha',
    theme: 'Theme',
    dark_mode: 'Dark Mode',
    light_mode: 'Light Mode',
    backup: 'Backup',
    restore: 'Restore',

    stock_alert: 'Stock Alert',
    payment_reminder: 'Payment Reminder',

    send_on_whatsapp: 'WhatsApp pe Bhejo',
    share_invoice: 'Bill Share Karo',
    payment_link: 'Payment Link',
};

// All translations
const translations: Record<AppLanguage, Translations> = {
    en,
    hi,
    hinglish,
};

class I18nService {
    private currentLanguage: AppLanguage = 'en';
    private listeners: Set<() => void> = new Set();

    constructor() {
        this.loadLanguage();
    }

    /**
     * Load language from storage
     */
    private loadLanguage(): void {
        const saved = localStorage.getItem('app_language') as AppLanguage | null;
        this.currentLanguage = saved || 'en';
    }

    /**
     * Get current language
     */
    getLanguage(): AppLanguage {
        return this.currentLanguage;
    }

    /**
     * Set language
     */
    setLanguage(lang: AppLanguage): void {
        this.currentLanguage = lang;
        localStorage.setItem('app_language', lang);

        // Notify listeners
        this.listeners.forEach(listener => listener());

        console.log(`[I18nService] Language changed to: ${lang}`);
    }

    /**
     * Get translation for key
     */
    t(key: keyof Translations): string {
        return translations[this.currentLanguage][key] || translations['en'][key] || key;
    }

    /**
     * Get all translations for current language
     */
    getTranslations(): Translations {
        return translations[this.currentLanguage];
    }

    /**
     * Subscribe to language changes
     */
    subscribe(callback: () => void): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Get language display name
     */
    getLanguageDisplayName(lang?: AppLanguage): string {
        const l = lang || this.currentLanguage;
        switch (l) {
            case 'hi':
                return 'हिंदी';
            case 'hinglish':
                return 'Hinglish';
            default:
                return 'English';
        }
    }

    /**
     * Get all available languages
     */
    getAvailableLanguages(): { code: AppLanguage; name: string; nativeName: string }[] {
        return [
            { code: 'en', name: 'English', nativeName: 'English' },
            { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
            { code: 'hinglish', name: 'Hinglish', nativeName: 'Hinglish' },
        ];
    }
}

// Export singleton instance
export const i18n = new I18nService();
export default i18n;

// Hook helper for React components
export function useTranslation() {
    return {
        t: (key: keyof Translations) => i18n.t(key),
        language: i18n.getLanguage(),
        setLanguage: (lang: AppLanguage) => i18n.setLanguage(lang),
        languages: i18n.getAvailableLanguages(),
    };
}
