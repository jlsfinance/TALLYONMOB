const pcVersion = '3.2.29';

export const APP_INFO = {
    name: 'Syncora',
    packageName: 'com.syncoraa.app',
    company: 'Shaurya Ltd',
    siteUrl: import.meta.env.VITE_APP_SITE_URL || 'https://tallyonmob.vercel.app',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.syncoraa.app',
    supportEmail: import.meta.env.VITE_SUPPORT_EMAIL || 'lovneetrathi@gmail.com',
    supportPhone: import.meta.env.VITE_SUPPORT_PHONE || '+91 9413821007',
    supportHours: 'Monday to Saturday, 10:00 AM to 7:00 PM IST',
    privacyPath: '/privacy',
    termsPath: '/terms',
    refundPath: '/refund',
    supportPath: '/support',
    securityPath: '/security',
    accountDeletionPath: '/account-deletion',
    trustCenterPath: '/trust-center',
    lastUpdated: 'March 15, 2026',
    githubRepo: 'jlsfinance/TALLYONMOB',
    pcDownloadUrl: `https://github.com/jlsfinance/TALLYONMOB/releases/download/v${pcVersion}/SyncoraConnector-Setup-${pcVersion}.exe`,
    pcVersion,
    androidDownloadUrl: 'https://github.com/jlsfinance/TALLYONMOB/releases/latest',
} as const;

export const getPublicUrl = (path: string) => `${APP_INFO.siteUrl}${path}`;
