/**
 * TallyLink i18n Translation System
 * Languages: English, Hindi, Gujarati, Marathi, Tamil, Telugu
 */

export type Language = 'en' | 'hi' | 'gu' | 'mr' | 'ta' | 'te';

export interface LanguageMeta {
    code: Language;
    name: string;
    nativeName: string;
    flag: string;
}

export const LANGUAGES: LanguageMeta[] = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
    { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', flag: '🇮🇳' },
    { code: 'mr', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳' },
    { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
    { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳' },
];

type TranslationKeys = {
    // Common / Navigation
    'nav.dashboard': string;
    'nav.parties': string;
    'nav.sales': string;
    'nav.purchases': string;
    'nav.vouchers': string;
    'nav.stock': string;
    'nav.reports': string;
    'nav.settings': string;
    'nav.logout': string;
    'nav.ai_assistant': string;
    'nav.payment_reminders': string;
    'nav.gst_reports': string;
    'nav.sync_history': string;
    'nav.team': string;
    'nav.backup': string;
    'nav.recurring': string;
    'nav.customer_portal': string;
    'nav.report_builder': string;

    // Dashboard
    'dashboard.title': string;
    'dashboard.total_sales': string;
    'dashboard.total_purchases': string;
    'dashboard.receivable': string;
    'dashboard.payable': string;
    'dashboard.recent_vouchers': string;
    'dashboard.top_debtors': string;
    'dashboard.welcome': string;

    // Common Actions
    'action.save': string;
    'action.cancel': string;
    'action.delete': string;
    'action.edit': string;
    'action.search': string;
    'action.filter': string;
    'action.export': string;
    'action.import': string;
    'action.refresh': string;
    'action.add': string;
    'action.send': string;
    'action.download': string;
    'action.share': string;
    'action.back': string;
    'action.next': string;
    'action.create': string;
    'action.view_all': string;
    'action.loading': string;
    'action.no_data': string;
    'action.confirm': string;

    // Parties / Ledgers
    'parties.title': string;
    'parties.debtors': string;
    'parties.creditors': string;
    'parties.balance': string;
    'parties.outstanding': string;
    'parties.contact': string;
    'parties.gstin': string;

    // Sales
    'sales.title': string;
    'sales.invoice': string;
    'sales.invoice_number': string;
    'sales.party': string;
    'sales.amount': string;
    'sales.date': string;
    'sales.create_invoice': string;

    // Purchases
    'purchases.title': string;
    'purchases.bill_number': string;

    // Stock
    'stock.title': string;
    'stock.item_name': string;
    'stock.quantity': string;
    'stock.rate': string;
    'stock.value': string;
    'stock.low_stock': string;

    // Reports
    'reports.profit_loss': string;
    'reports.balance_sheet': string;
    'reports.aging': string;
    'reports.gst_summary': string;
    'reports.sales_analytics': string;

    // AI Assistant
    'ai.title': string;
    'ai.ask_question': string;
    'ai.thinking': string;
    'ai.insights': string;

    // Payment Reminders
    'reminders.title': string;
    'reminders.send_reminder': string;
    'reminders.via_email': string;
    'reminders.via_whatsapp': string;
    'reminders.overdue': string;

    // Settings
    'settings.language': string;
    'settings.theme': string;
    'settings.company': string;
    'settings.profile': string;

    // Recurring Invoices
    'recurring.title': string;
    'recurring.frequency': string;
    'recurring.next_date': string;
    'recurring.active': string;
    'recurring.paused': string;
    'recurring.create': string;

    // Customer Portal
    'portal.title': string;
    'portal.statement': string;
    'portal.pay_now': string;
    'portal.download_invoice': string;

    // Report Builder
    'report_builder.title': string;
    'report_builder.select_table': string;
    'report_builder.select_fields': string;
    'report_builder.run_report': string;

    // Dashboard Extras
    'dashboard.overview': string;
    'dashboard.revenue_trend': string;
    'dashboard.last_6_months': string;
    'dashboard.quick_actions': string;
    'dashboard.no_recent': string;
    'dashboard.view_all_transactions': string;
    'dashboard.new_invoice': string;

    // New Settings Keys
    'settings.payment_qr': string;
    'settings.payment_qr_desc': string;
    'settings.payment_config': string;
    'settings.backup_data': string;
    'settings.team_management': string;
    'settings.general': string;
    'settings.upi_placeholder': string;
    'settings.save_upi': string;
    'settings.upi_saved': string;
};

type Translations = Record<Language, TranslationKeys>;

export const translations: Translations = {
    en: {
        'nav.dashboard': 'Dashboard',
        'nav.parties': 'Parties',
        'nav.sales': 'Sales',
        'nav.purchases': 'Purchases',
        'nav.vouchers': 'Vouchers',
        'nav.stock': 'Stock',
        'nav.reports': 'Reports',
        'nav.settings': 'Settings',
        'nav.logout': 'Logout',
        'nav.ai_assistant': 'AI Assistant',
        'nav.payment_reminders': 'Payment Reminders',
        'nav.gst_reports': 'GST Reports',
        'nav.sync_history': 'Sync History',
        'nav.team': 'Team',
        'nav.backup': 'Backup',
        'nav.recurring': 'Recurring Invoices',
        'nav.customer_portal': 'Customer Portal',
        'nav.report_builder': 'Report Builder',

        'dashboard.title': 'Dashboard',
        'dashboard.total_sales': 'Total Sales',
        'dashboard.total_purchases': 'Total Purchases',
        'dashboard.receivable': 'Receivable',
        'dashboard.payable': 'Payable',
        'dashboard.recent_vouchers': 'Recent Vouchers',
        'dashboard.top_debtors': 'Top Debtors',
        'dashboard.welcome': 'Welcome back',

        'action.save': 'Save',
        'action.cancel': 'Cancel',
        'action.delete': 'Delete',
        'action.edit': 'Edit',
        'action.search': 'Search',
        'action.filter': 'Filter',
        'action.export': 'Export',
        'action.import': 'Import',
        'action.refresh': 'Refresh',
        'action.add': 'Add',
        'action.send': 'Send',
        'action.download': 'Download',
        'action.share': 'Share',
        'action.back': 'Back',
        'action.next': 'Next',
        'action.create': 'Create',
        'action.view_all': 'View All',
        'action.loading': 'Loading...',
        'action.no_data': 'No data found',
        'action.confirm': 'Confirm',

        'parties.title': 'Parties',
        'parties.debtors': 'Sundry Debtors',
        'parties.creditors': 'Sundry Creditors',
        'parties.balance': 'Balance',
        'parties.outstanding': 'Outstanding',
        'parties.contact': 'Contact',
        'parties.gstin': 'GSTIN',

        'sales.title': 'Sales',
        'sales.invoice': 'Invoice',
        'sales.invoice_number': 'Invoice Number',
        'sales.party': 'Party Name',
        'sales.amount': 'Amount',
        'sales.date': 'Date',
        'sales.create_invoice': 'Create Invoice',

        'purchases.title': 'Purchases',
        'purchases.bill_number': 'Bill Number',

        'stock.title': 'Stock Items',
        'stock.item_name': 'Item Name',
        'stock.quantity': 'Quantity',
        'stock.rate': 'Rate',
        'stock.value': 'Value',
        'stock.low_stock': 'Low Stock',

        'reports.profit_loss': 'Profit & Loss',
        'reports.balance_sheet': 'Balance Sheet',
        'reports.aging': 'Aging Report',
        'reports.gst_summary': 'GST Summary',
        'reports.sales_analytics': 'Sales Analytics',

        'ai.title': 'AI Assistant',
        'ai.ask_question': 'Ask a question about your business...',
        'ai.thinking': 'Thinking...',
        'ai.insights': 'Smart Insights',

        'reminders.title': 'Payment Reminders',
        'reminders.send_reminder': 'Send Reminder',
        'reminders.via_email': 'Via Email',
        'reminders.via_whatsapp': 'Via WhatsApp',
        'reminders.overdue': 'Overdue',

        'settings.language': 'Language',
        'settings.theme': 'Theme',
        'settings.company': 'Company',
        'settings.profile': 'Profile',

        'recurring.title': 'Recurring Invoices',
        'recurring.frequency': 'Frequency',
        'recurring.next_date': 'Next Invoice Date',
        'recurring.active': 'Active',
        'recurring.paused': 'Paused',
        'recurring.create': 'Create Recurring Invoice',

        'portal.title': 'Customer Portal',
        'portal.statement': 'Account Statement',
        'portal.pay_now': 'Pay Now',
        'portal.download_invoice': 'Download Invoice',

        'report_builder.title': 'Report Builder',
        'report_builder.select_table': 'Select Data Source',
        'report_builder.select_fields': 'Select Fields',
        'report_builder.run_report': 'Run Report',

        'dashboard.overview': 'Overview for',
        'dashboard.revenue_trend': 'Revenue Trend',
        'dashboard.last_6_months': 'Last 6 months',
        'dashboard.quick_actions': 'Quick Actions',
        'dashboard.no_recent': 'No recent activity',
        'dashboard.view_all_transactions': 'View All Transactions',
        'dashboard.new_invoice': 'New Invoice',

        // Settings
        'settings.payment_qr': 'Payment QR Code',
        'settings.payment_qr_desc': 'Configure UPI QR Code for Invoices',
        'settings.payment_config': 'Payment Configuration',
        'settings.backup_data': 'Data Backup & Restore',
        'settings.team_management': 'Team Management',
        'settings.general': 'General Settings',
        'settings.upi_placeholder': 'Enter Company UPI ID (e.g. name@upi)',
        'settings.save_upi': 'Save UPI ID',
        'settings.upi_saved': 'UPI ID Saved Successfully',
    },

    hi: {
        'nav.dashboard': 'डैशबोर्ड',
        'nav.parties': 'पार्टी',
        'nav.sales': 'बिक्री',
        'nav.purchases': 'खरीदी',
        'nav.vouchers': 'वाउचर',
        'nav.stock': 'स्टॉक',
        'nav.reports': 'रिपोर्ट',
        'nav.settings': 'सेटिंग्स',
        'nav.logout': 'लॉगआउट',
        'nav.ai_assistant': 'AI सहायक',
        'nav.payment_reminders': 'भुगतान अनुस्मारक',
        'nav.gst_reports': 'GST रिपोर्ट',
        'nav.sync_history': 'सिंक इतिहास',
        'nav.team': 'टीम',
        'nav.backup': 'बैकअप',
        'nav.recurring': 'आवर्ती बिल',
        'nav.customer_portal': 'ग्राहक पोर्टल',
        'nav.report_builder': 'रिपोर्ट बिल्डर',

        'dashboard.title': 'डैशबोर्ड',
        'dashboard.total_sales': 'कुल बिक्री',
        'dashboard.total_purchases': 'कुल खरीदी',
        'dashboard.receivable': 'प्राप्य',
        'dashboard.payable': 'देय',
        'dashboard.recent_vouchers': 'हाल के वाउचर',
        'dashboard.top_debtors': 'शीर्ष देनदार',
        'dashboard.welcome': 'वापस स्वागत है',

        'action.save': 'सेव करें',
        'action.cancel': 'रद्द करें',
        'action.delete': 'हटाएं',
        'action.edit': 'संपादन',
        'action.search': 'खोजें',
        'action.filter': 'फ़िल्टर',
        'action.export': 'एक्सपोर्ट',
        'action.import': 'आयात',
        'action.refresh': 'रिफ्रेश',
        'action.add': 'जोड़ें',
        'action.send': 'भेजें',
        'action.download': 'डाउनलोड',
        'action.share': 'शेयर',
        'action.back': 'वापस',
        'action.next': 'आगे',
        'action.create': 'बनाएं',
        'action.view_all': 'सभी देखें',
        'action.loading': 'लोड हो रहा है...',
        'action.no_data': 'कोई डेटा नहीं मिला',
        'action.confirm': 'पुष्टि करें',

        'parties.title': 'पार्टी',
        'parties.debtors': 'देनदार',
        'parties.creditors': 'लेनदार',
        'parties.balance': 'बैलेंस',
        'parties.outstanding': 'बकाया',
        'parties.contact': 'संपर्क',
        'parties.gstin': 'GSTIN',

        'sales.title': 'बिक्री',
        'sales.invoice': 'इनवॉइस',
        'sales.invoice_number': 'इनवॉइस नंबर',
        'sales.party': 'पार्टी का नाम',
        'sales.amount': 'राशि',
        'sales.date': 'तारीख',
        'sales.create_invoice': 'इनवॉइस बनाएं',

        'purchases.title': 'खरीदी',
        'purchases.bill_number': 'बिल नंबर',

        'stock.title': 'स्टॉक आइटम',
        'stock.item_name': 'आइटम का नाम',
        'stock.quantity': 'मात्रा',
        'stock.rate': 'दर',
        'stock.value': 'मूल्य',
        'stock.low_stock': 'कम स्टॉक',

        'reports.profit_loss': 'लाभ और हानि',
        'reports.balance_sheet': 'बैलेंस शीट',
        'reports.aging': 'एजिंग रिपोर्ट',
        'reports.gst_summary': 'GST सारांश',
        'reports.sales_analytics': 'बिक्री विश्लेषण',

        'ai.title': 'AI सहायक',
        'ai.ask_question': 'अपने व्यापार के बारे में पूछें...',
        'ai.thinking': 'सोच रहा है...',
        'ai.insights': 'स्मार्ट इनसाइट्स',

        'reminders.title': 'भुगतान अनुस्मारक',
        'reminders.send_reminder': 'रिमाइंडर भेजें',
        'reminders.via_email': 'ईमेल से',
        'reminders.via_whatsapp': 'WhatsApp से',
        'reminders.overdue': 'बकाया',

        'settings.language': 'भाषा',
        'settings.theme': 'थीम',
        'settings.company': 'कंपनी',
        'settings.profile': 'प्रोफ़ाइल',

        'recurring.title': 'आवर्ती इनवॉइस',
        'recurring.frequency': 'आवृत्ति',
        'recurring.next_date': 'अगली इनवॉइस तारीख',
        'recurring.active': 'सक्रिय',
        'recurring.paused': 'रुका हुआ',
        'recurring.create': 'आवर्ती इनवॉइस बनाएं',

        'portal.title': 'ग्राहक पोर्टल',
        'portal.statement': 'खाता विवरण',
        'portal.pay_now': 'अभी भुगतान करें',
        'portal.download_invoice': 'इनवॉइस डाउनलोड',

        'report_builder.title': 'रिपोर्ट बिल्डर',
        'report_builder.select_table': 'डेटा स्रोत चुनें',
        'report_builder.select_fields': 'फ़ील्ड चुनें',
        'report_builder.run_report': 'रिपोर्ट चलाएं',

        'dashboard.overview': 'अवलोकन',
        'dashboard.revenue_trend': 'राजस्व रुझान',
        'dashboard.last_6_months': 'पिछले 6 महीने',
        'dashboard.quick_actions': 'त्वरित कार्य',
        'dashboard.no_recent': 'कोई हालिया गतिविधि नहीं',
        'dashboard.view_all_transactions': 'सभी लेनदेन देखें',
        'dashboard.new_invoice': 'नया इनवॉइस',

        // Settings
        'settings.payment_qr': 'भुगतान QR कोड',
        'settings.payment_qr_desc': 'इनवॉइस के लिए UPI QR कॉन्फ़िगर करें',
        'settings.payment_config': 'भुगतान कॉन्फ़िगरेशन',
        'settings.backup_data': 'डेटा बैकअप और रिस्टोर',
        'settings.team_management': 'टीम प्रबंधन',
        'settings.general': 'सामान्य सेटिंग्स',
        'settings.upi_placeholder': 'कंपनी UPI आयडी दर्ज करें',
        'settings.save_upi': 'UPI आयडी सहेजें',
        'settings.upi_saved': 'UPI आयडी सफलतापूर्वक सहेजा गया',
    },

    gu: {
        'nav.dashboard': 'ડેશબોર્ડ', 'nav.parties': 'પાર્ટી', 'nav.sales': 'વેચાણ', 'nav.purchases': 'ખરીદી',
        'nav.vouchers': 'વાઉચર', 'nav.stock': 'સ્ટૉક', 'nav.reports': 'રિપોર્ટ', 'nav.settings': 'સેટિંગ્સ',
        'nav.logout': 'લૉગઆઉટ', 'nav.ai_assistant': 'AI સહાયક', 'nav.payment_reminders': 'ચુકવણી રીમાઇન્ડર',
        'nav.gst_reports': 'GST રિપોર્ટ', 'nav.sync_history': 'સિંક ઇતિહાસ', 'nav.team': 'ટીમ',
        'nav.backup': 'બેકઅપ', 'nav.recurring': 'આવર્તી બિલ', 'nav.customer_portal': 'ગ્રાહક પોર્ટલ',
        'nav.report_builder': 'રિપોર્ટ બિલ્ડર',
        'dashboard.title': 'ડેશબોર્ડ', 'dashboard.total_sales': 'કુલ વેચાણ', 'dashboard.total_purchases': 'કુલ ખરીદી',
        'dashboard.receivable': 'લેણું', 'dashboard.payable': 'દેણું', 'dashboard.recent_vouchers': 'તાજેતરના વાઉચર',
        'dashboard.top_debtors': 'ટોચના દેવાદાર', 'dashboard.welcome': 'પાછા સ્વાગત',
        'action.save': 'સેવ', 'action.cancel': 'રદ', 'action.delete': 'કાઢી નાખો', 'action.edit': 'ફેરફાર',
        'action.search': 'શોધો', 'action.filter': 'ફિલ્ટર', 'action.export': 'એક્સપોર્ટ', 'action.import': 'આયાત',
        'action.refresh': 'રિફ્રેશ', 'action.add': 'ઉમેરો', 'action.send': 'મોકલો', 'action.download': 'ડાઉનલોડ',
        'action.share': 'શેર', 'action.back': 'પાછા', 'action.next': 'આગળ', 'action.create': 'બનાવો',
        'action.view_all': 'બધું જુઓ', 'action.loading': 'લોડ થઈ રહ્યું છે...', 'action.no_data': 'કોઈ ડેટા નથી',
        'action.confirm': 'ખાતરી કરો',
        'parties.title': 'પાર્ટી', 'parties.debtors': 'દેવાદાર', 'parties.creditors': 'લેણદાર',
        'parties.balance': 'બેલેન્સ', 'parties.outstanding': 'બાકી', 'parties.contact': 'સંપર્ક', 'parties.gstin': 'GSTIN',
        'sales.title': 'વેચાણ', 'sales.invoice': 'ઇનવોઇસ', 'sales.invoice_number': 'ઇનવોઇસ નંબર',
        'sales.party': 'પાર્ટીનું નામ', 'sales.amount': 'રકમ', 'sales.date': 'તારીખ', 'sales.create_invoice': 'ઇનવોઇસ બનાવો',
        'purchases.title': 'ખરીદી', 'purchases.bill_number': 'બિલ નંબર',
        'stock.title': 'સ્ટૉક આઇટમ', 'stock.item_name': 'આઇટમ નામ', 'stock.quantity': 'જથ્થો',
        'stock.rate': 'દર', 'stock.value': 'મૂલ્ય', 'stock.low_stock': 'ઓછો સ્ટૉક',
        'reports.profit_loss': 'નફો અને નુકસાન', 'reports.balance_sheet': 'બેલેન્સ શીટ',
        'reports.aging': 'એજિંગ રિપોર્ટ', 'reports.gst_summary': 'GST સારાંશ', 'reports.sales_analytics': 'વેચાણ વિશ્લેષણ',
        'ai.title': 'AI સહાયક', 'ai.ask_question': 'તમારા વ્યવસાય વિશે પૂછો...', 'ai.thinking': 'વિચારી રહ્યું છે...', 'ai.insights': 'સ્માર્ટ ઇનસાઇટ્સ',
        'reminders.title': 'ચુકવણી રીમાઇન્ડર', 'reminders.send_reminder': 'રીમાઇન્ડર મોકલો', 'reminders.via_email': 'ઈમેલથી', 'reminders.via_whatsapp': 'WhatsApp થી', 'reminders.overdue': 'બાકી',
        'settings.language': 'ભાષા', 'settings.theme': 'થીમ', 'settings.company': 'કંપની', 'settings.profile': 'પ્રોફાઇલ',
        'recurring.title': 'આવર્તી ઇનવોઇસ', 'recurring.frequency': 'આવર્તન', 'recurring.next_date': 'આગામી ઇનવોઇસ તારીખ', 'recurring.active': 'સક્રિય', 'recurring.paused': 'થોભેલું', 'recurring.create': 'આવર્તી ઇનવોઇસ બનાવો',
        'portal.title': 'ગ્રાહક પોર્ટલ', 'portal.statement': 'ખાતા વિવરણ', 'portal.pay_now': 'હમણાં ચૂકવો', 'portal.download_invoice': 'ઇનવોઇસ ડાઉનલોડ',
        'report_builder.title': 'રિપોર્ટ બિલ્ડર', 'report_builder.select_table': 'ડેટા સ્ત્રોત', 'report_builder.select_fields': 'ફીલ્ડ પસંદ કરો',
        'report_builder.run_report': 'રિપોર્ટ ચલાવો',
        'dashboard.overview': 'Overview for',
        'dashboard.revenue_trend': 'Revenue Trend',
        'dashboard.last_6_months': 'Last 6 months',
        'dashboard.quick_actions': 'Quick Actions',
        'dashboard.no_recent': 'No recent activity',
        'dashboard.view_all_transactions': 'View All Transactions',
        'dashboard.new_invoice': 'New Invoice',
        'settings.payment_qr': 'Payment QR Code',
        'settings.payment_qr_desc': 'Configure UPI QR Code for Invoices',
        'settings.payment_config': 'Payment Configuration',
        'settings.backup_data': 'Data Backup & Restore',
        'settings.team_management': 'Team Management',
        'settings.general': 'General Settings',
        'settings.upi_placeholder': 'Enter Company UPI ID (e.g. name@upi)',
        'settings.save_upi': 'Save UPI ID',
        'settings.upi_saved': 'UPI ID Saved Successfully',
    },

    mr: {
        'nav.dashboard': 'डॅशबोर्ड', 'nav.parties': 'पार्टी', 'nav.sales': 'विक्री', 'nav.purchases': 'खरेदी',
        'nav.vouchers': 'व्हाउचर', 'nav.stock': 'स्टॉक', 'nav.reports': 'अहवाल', 'nav.settings': 'सेटिंग्ज',
        'nav.logout': 'लॉगआउट', 'nav.ai_assistant': 'AI सहाय्यक', 'nav.payment_reminders': 'पेमेंट रिमाइंडर',
        'nav.gst_reports': 'GST अहवाल', 'nav.sync_history': 'सिंक इतिहास', 'nav.team': 'टीम',
        'nav.backup': 'बॅकअप', 'nav.recurring': 'आवर्ती बिल', 'nav.customer_portal': 'ग्राहक पोर्टल',
        'nav.report_builder': 'अहवाल बिल्डर',
        'dashboard.title': 'डॅशबोर्ड', 'dashboard.total_sales': 'एकूण विक्री', 'dashboard.total_purchases': 'एकूण खरेदी',
        'dashboard.receivable': 'येणे', 'dashboard.payable': 'देणे', 'dashboard.recent_vouchers': 'अलीकडील व्हाउचर',
        'dashboard.top_debtors': 'शीर्ष देणेकरी', 'dashboard.welcome': 'पुन्हा स्वागत',
        'action.save': 'सेव्ह', 'action.cancel': 'रद्द', 'action.delete': 'हटवा', 'action.edit': 'संपादन',
        'action.search': 'शोधा', 'action.filter': 'फिल्टर', 'action.export': 'एक्सपोर्ट', 'action.import': 'आयात',
        'action.refresh': 'रिफ्रेश', 'action.add': 'जोडा', 'action.send': 'पाठवा', 'action.download': 'डाउनलोड',
        'action.share': 'शेअर', 'action.back': 'मागे', 'action.next': 'पुढे', 'action.create': 'तयार करा',
        'action.view_all': 'सर्व पहा', 'action.loading': 'लोड होत आहे...', 'action.no_data': 'डेटा सापडला नाही',
        'action.confirm': 'पुष्टी करा',
        'parties.title': 'पार्टी', 'parties.debtors': 'देणेकरी', 'parties.creditors': 'धनको',
        'parties.balance': 'शिल्लक', 'parties.outstanding': 'थकबाकी', 'parties.contact': 'संपर्क', 'parties.gstin': 'GSTIN',
        'sales.title': 'विक्री', 'sales.invoice': 'बिल', 'sales.invoice_number': 'बिल क्रमांक',
        'sales.party': 'पार्टी नाव', 'sales.amount': 'रक्कम', 'sales.date': 'तारीख', 'sales.create_invoice': 'बिल तयार करा',
        'purchases.title': 'खरेदी', 'purchases.bill_number': 'बिल क्रमांक',
        'stock.title': 'स्टॉक', 'stock.item_name': 'वस्तूचे नाव', 'stock.quantity': 'प्रमाण',
        'stock.rate': 'दर', 'stock.value': 'किंमत', 'stock.low_stock': 'कमी स्टॉक',
        'reports.profit_loss': 'नफा तोटा', 'reports.balance_sheet': 'ताळेबंद',
        'reports.aging': 'एजिंग अहवाल', 'reports.gst_summary': 'GST सारांश', 'reports.sales_analytics': 'विक्री विश्लेषण',
        'ai.title': 'AI सहाय्यक', 'ai.ask_question': 'तुमच्या व्यवसायाबद्दल विचारा...', 'ai.thinking': 'विचार करत आहे...', 'ai.insights': 'स्मार्ट इनसाइट्स',
        'reminders.title': 'पेमेंट रिमाइंडर', 'reminders.send_reminder': 'रिमाइंडर पाठवा', 'reminders.via_email': 'ईमेलने', 'reminders.via_whatsapp': 'WhatsApp ने', 'reminders.overdue': 'थकबाकी',
        'settings.language': 'भाषा', 'settings.theme': 'थीम', 'settings.company': 'कंपनी', 'settings.profile': 'प्रोफाइल',
        'recurring.title': 'आवर्ती बिले', 'recurring.frequency': 'वारंवारता', 'recurring.next_date': 'पुढील बिल तारीख', 'recurring.active': 'सक्रिय', 'recurring.paused': 'थांबलेले', 'recurring.create': 'आवर्ती बिल तयार करा',
        'portal.title': 'ग्राहक पोर्टल', 'portal.statement': 'खाते विवरण', 'portal.pay_now': 'आता पैसे द्या', 'portal.download_invoice': 'बिल डाउनलोड',
        'report_builder.title': 'अहवाल बिल्डर', 'report_builder.select_table': 'डेटा स्रोत', 'report_builder.select_fields': 'फील्ड निवडा',
        'report_builder.run_report': 'अहवाल चालवा',
        'dashboard.overview': 'Overview for',
        'dashboard.revenue_trend': 'Revenue Trend',
        'dashboard.last_6_months': 'Last 6 months',
        'dashboard.quick_actions': 'Quick Actions',
        'dashboard.no_recent': 'No recent activity',
        'dashboard.view_all_transactions': 'View All Transactions',
        'dashboard.new_invoice': 'New Invoice',
        'settings.payment_qr': 'Payment QR Code',
        'settings.payment_qr_desc': 'Configure UPI QR Code for Invoices',
        'settings.payment_config': 'Payment Configuration',
        'settings.backup_data': 'Data Backup & Restore',
        'settings.team_management': 'Team Management',
        'settings.general': 'General Settings',
        'settings.upi_placeholder': 'Enter Company UPI ID (e.g. name@upi)',
        'settings.save_upi': 'Save UPI ID',
        'settings.upi_saved': 'UPI ID Saved Successfully',
    },

    ta: {
        'nav.dashboard': 'டாஷ்போர்டு', 'nav.parties': 'பார்ட்டி', 'nav.sales': 'விற்பனை', 'nav.purchases': 'கொள்முதல்',
        'nav.vouchers': 'வவுச்சர்', 'nav.stock': 'சரக்கு', 'nav.reports': 'அறிக்கை', 'nav.settings': 'அமைப்புகள்',
        'nav.logout': 'வெளியேறு', 'nav.ai_assistant': 'AI உதவியாளர்', 'nav.payment_reminders': 'கட்டண நினைவூட்டல்',
        'nav.gst_reports': 'GST அறிக்கை', 'nav.sync_history': 'ஒத்திசைவு வரலாறு', 'nav.team': 'குழு',
        'nav.backup': 'காப்புப்பிரதி', 'nav.recurring': 'தொடர் பில்', 'nav.customer_portal': 'வாடிக்கையாளர் போர்ட்டல்',
        'nav.report_builder': 'அறிக்கை உருவாக்கி',
        'dashboard.title': 'டாஷ்போர்டு', 'dashboard.total_sales': 'மொத்த விற்பனை', 'dashboard.total_purchases': 'மொத்த கொள்முதல்',
        'dashboard.receivable': 'பெறவேண்டியவை', 'dashboard.payable': 'செலுத்தவேண்டியவை', 'dashboard.recent_vouchers': 'சமீபத்திய வவுச்சர்',
        'dashboard.top_debtors': 'முக்கிய கடனாளிகள்', 'dashboard.welcome': 'மீண்டும் வரவேற்கிறோம்',
        'action.save': 'சேமி', 'action.cancel': 'ரத்து', 'action.delete': 'நீக்கு', 'action.edit': 'திருத்து',
        'action.search': 'தேடு', 'action.filter': 'வடிகட்டு', 'action.export': 'ஏற்றுமதி', 'action.import': 'இறக்குமதி',
        'action.refresh': 'புதுப்பி', 'action.add': 'சேர்', 'action.send': 'அனுப்பு', 'action.download': 'பதிவிறக்கு',
        'action.share': 'பகிர்', 'action.back': 'பின்', 'action.next': 'அடுத்து', 'action.create': 'உருவாக்கு',
        'action.view_all': 'அனைத்தும் காண்', 'action.loading': 'ஏற்றுகிறது...', 'action.no_data': 'தரவு இல்லை',
        'action.confirm': 'உறுதிப்படுத்து',
        'parties.title': 'பார்ட்டி', 'parties.debtors': 'கடனாளிகள்', 'parties.creditors': 'கடன் தருபவர்',
        'parties.balance': 'இருப்பு', 'parties.outstanding': 'நிலுவை', 'parties.contact': 'தொடர்பு', 'parties.gstin': 'GSTIN',
        'sales.title': 'விற்பனை', 'sales.invoice': 'விலைப்பட்டி', 'sales.invoice_number': 'விலைப்பட்டி எண்',
        'sales.party': 'பார்ட்டி பெயர்', 'sales.amount': 'தொகை', 'sales.date': 'தேதி', 'sales.create_invoice': 'விலைப்பட்டி உருவாக்கு',
        'purchases.title': 'கொள்முதல்', 'purchases.bill_number': 'பில் எண்',
        'stock.title': 'சரக்கு', 'stock.item_name': 'பொருள் பெயர்', 'stock.quantity': 'அளவு',
        'stock.rate': 'விலை', 'stock.value': 'மதிப்பு', 'stock.low_stock': 'குறைந்த சரக்கு',
        'reports.profit_loss': 'லாப நஷ்டம்', 'reports.balance_sheet': 'இருப்புநிலை',
        'reports.aging': 'வயது அறிக்கை', 'reports.gst_summary': 'GST சுருக்கம்', 'reports.sales_analytics': 'விற்பனை பகுப்பாய்வு',
        'ai.title': 'AI உதவியாளர்', 'ai.ask_question': 'வணிகம் பற்றி கேளுங்கள்...', 'ai.thinking': 'யோசிக்கிறது...', 'ai.insights': 'நுண்ணறிவுகள்',
        'reminders.title': 'கட்டண நினைவூட்டல்', 'reminders.send_reminder': 'நினைவூட்டல் அனுப்பு', 'reminders.via_email': 'மின்னஞ்சலில்', 'reminders.via_whatsapp': 'WhatsApp இல்', 'reminders.overdue': 'நிலுவை',
        'settings.language': 'மொழி', 'settings.theme': 'தீம்', 'settings.company': 'நிறுவனம்', 'settings.profile': 'சுயவிவரம்',
        'recurring.title': 'தொடர் விலைப்பட்டி', 'recurring.frequency': 'அதிர்வெண்', 'recurring.next_date': 'அடுத்த பில் தேதி', 'recurring.active': 'செயலில்', 'recurring.paused': 'நிறுத்தப்பட்டது', 'recurring.create': 'தொடர் பில் உருவாக்கு',
        'portal.title': 'வாடிக்கையாளர் போர்ட்டல்', 'portal.statement': 'கணக்கு அறிக்கை', 'portal.pay_now': 'இப்போது செலுத்து', 'portal.download_invoice': 'பில் பதிவிறக்கு',
        'report_builder.title': 'அறிக்கை உருவாக்கி', 'report_builder.select_table': 'தரவு மூலம்', 'report_builder.select_fields': 'புலங்கள் தேர்வு',
        'report_builder.run_report': 'அறிக்கை இயக்கு',
        'dashboard.overview': 'Overview for',
        'dashboard.revenue_trend': 'Revenue Trend',
        'dashboard.last_6_months': 'Last 6 months',
        'dashboard.quick_actions': 'Quick Actions',
        'dashboard.no_recent': 'No recent activity',
        'dashboard.view_all_transactions': 'View All Transactions',
        'dashboard.new_invoice': 'New Invoice',
        'settings.payment_qr': 'Payment QR Code',
        'settings.payment_qr_desc': 'Configure UPI QR Code for Invoices',
        'settings.payment_config': 'Payment Configuration',
        'settings.backup_data': 'Data Backup & Restore',
        'settings.team_management': 'Team Management',
        'settings.general': 'General Settings',
        'settings.upi_placeholder': 'Enter Company UPI ID (e.g. name@upi)',
        'settings.save_upi': 'Save UPI ID',
        'settings.upi_saved': 'UPI ID Saved Successfully',
    },

    te: {
        'nav.dashboard': 'డాష్‌బోర్డ్', 'nav.parties': 'పార్టీ', 'nav.sales': 'అమ్మకాలు', 'nav.purchases': 'కొనుగోళ్ళు',
        'nav.vouchers': 'వోచర్', 'nav.stock': 'స్టాక్', 'nav.reports': 'నివేదిక', 'nav.settings': 'సెట్టింగ్‌లు',
        'nav.logout': 'లాగ్‌అవుట్', 'nav.ai_assistant': 'AI సహాయకుడు', 'nav.payment_reminders': 'చెల్లింపు గుర్తింపు',
        'nav.gst_reports': 'GST నివేదిక', 'nav.sync_history': 'సింక్ చరిత్ర', 'nav.team': 'టీమ్',
        'nav.backup': 'బ్యాకప్', 'nav.recurring': 'రికరింగ్ బిల్', 'nav.customer_portal': 'కస్టమర్ పోర్టల్',
        'nav.report_builder': 'రిపోర్ట్ బిల్డర్',
        'dashboard.title': 'డాష్‌బోర్డ్', 'dashboard.total_sales': 'మొత్తం అమ్మకాలు', 'dashboard.total_purchases': 'మొత్తం కొనుగోళ్ళు',
        'dashboard.receivable': 'రాబడి', 'dashboard.payable': 'చెల్లింపు', 'dashboard.recent_vouchers': 'ఇటీవల వోచర్లు',
        'dashboard.top_debtors': 'ప్రధాన రుణదాతలు', 'dashboard.welcome': 'తిరిగి స్వాగతం',
        'action.save': 'సేవ్', 'action.cancel': 'రద్దు', 'action.delete': 'తొలగించు', 'action.edit': 'సవరణ',
        'action.search': 'వెతుకు', 'action.filter': 'ఫిల్టర్', 'action.export': 'ఎగుమతి', 'action.import': 'దిగుమతి',
        'action.refresh': 'రిఫ్రెష్', 'action.add': 'జోడించు', 'action.send': 'పంపు', 'action.download': 'డౌన్‌లోడ్',
        'action.share': 'షేర్', 'action.back': 'వెనక్కి', 'action.next': 'తదుపరి', 'action.create': 'సృష్టించు',
        'action.view_all': 'అన్నీ చూడు', 'action.loading': 'లోడ్ అవుతోంది...', 'action.no_data': 'డేటా లేదు',
        'action.confirm': 'నిర్ధారించు',
        'parties.title': 'పార్టీ', 'parties.debtors': 'రుణదాతలు', 'parties.creditors': 'రుణదాతలు',
        'parties.balance': 'బ్యాలెన్స్', 'parties.outstanding': 'బకాయి', 'parties.contact': 'సంప్రదించండి', 'parties.gstin': 'GSTIN',
        'sales.title': 'అమ్మకాలు', 'sales.invoice': 'ఇన్వాయిస్', 'sales.invoice_number': 'ఇన్వాయిస్ నంబర్',
        'sales.party': 'పార్టీ పేరు', 'sales.amount': 'మొత్తం', 'sales.date': 'తేదీ', 'sales.create_invoice': 'ఇన్వాయిస్ సృష్టించు',
        'purchases.title': 'కొనుగోళ్ళు', 'purchases.bill_number': 'బిల్ నంబర్',
        'stock.title': 'స్టాక్', 'stock.item_name': 'వస్తువు పేరు', 'stock.quantity': 'పరిమాణం',
        'stock.rate': 'రేటు', 'stock.value': 'విలువ', 'stock.low_stock': 'తక్కువ స్టాక్',
        'reports.profit_loss': 'లాభ నష్టం', 'reports.balance_sheet': 'బ్యాలెన్స్ షీట్',
        'reports.aging': 'వయస్సు నివేదిక', 'reports.gst_summary': 'GST సారాంశం', 'reports.sales_analytics': 'అమ్మకాల విశ్లేషణ',
        'ai.title': 'AI సహాయకుడు', 'ai.ask_question': 'మీ వ్యాపారం గురించి అడగండి...', 'ai.thinking': 'ఆలోచిస్తోంది...', 'ai.insights': 'స్మార్ట్ ఇన్‌సైట్స్',
        'reminders.title': 'చెల్లింపు గుర్తింపు', 'reminders.send_reminder': 'గుర్తింపు పంపు', 'reminders.via_email': 'ఇమెయిల్ ద్వారా', 'reminders.via_whatsapp': 'WhatsApp ద్వారా', 'reminders.overdue': 'బకాయి',
        'settings.language': 'భాష', 'settings.theme': 'థీమ్', 'settings.company': 'కంపెనీ', 'settings.profile': 'ప్రొఫైల్',
        'recurring.title': 'రికరింగ్ ఇన్వాయిస్', 'recurring.frequency': 'ఫ్రీక్వెన్సీ', 'recurring.next_date': 'తదుపరి బిల్ తేదీ', 'recurring.active': 'సక్రియ', 'recurring.paused': 'ఆగింది', 'recurring.create': 'రికరింగ్ బిల్ సృష్టించు',
        'portal.title': 'కస్టమర్ పోర్టల్', 'portal.statement': 'ఖాతా వివరణ', 'portal.pay_now': 'ఇప్పుడు చెల్లించు', 'portal.download_invoice': 'బిల్ డౌన్‌లోడ్',
        'report_builder.title': 'రిపోర్ట్ బిల్డర్', 'report_builder.select_table': 'డేటా మూలం', 'report_builder.select_fields': 'ఫీల్డ్‌లు ఎంచుకోండి',
        'report_builder.run_report': 'నివేదిక రన్ చేయండి',
        'dashboard.overview': 'Overview for',
        'dashboard.revenue_trend': 'Revenue Trend',
        'dashboard.last_6_months': 'Last 6 months',
        'dashboard.quick_actions': 'Quick Actions',
        'dashboard.no_recent': 'No recent activity',
        'dashboard.view_all_transactions': 'View All Transactions',
        'dashboard.new_invoice': 'New Invoice',
        'settings.payment_qr': 'Payment QR Code',
        'settings.payment_qr_desc': 'Configure UPI QR Code for Invoices',
        'settings.payment_config': 'Payment Configuration',
        'settings.backup_data': 'Data Backup & Restore',
        'settings.team_management': 'Team Management',
        'settings.general': 'General Settings',
        'settings.upi_placeholder': 'Enter Company UPI ID (e.g. name@upi)',
        'settings.save_upi': 'Save UPI ID',
        'settings.upi_saved': 'UPI ID Saved Successfully',
    },
};
