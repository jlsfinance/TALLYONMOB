export const APP_INFO = {
    name: 'JLS Bill',
    packageName: 'com.jls.billbook',
    company: 'JLS Bill',
    siteUrl: import.meta.env.VITE_APP_SITE_URL || 'https://jlsbillbook.app',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.jls.billbook',
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
} as const;

export const getPublicUrl = (path: string) => `${APP_INFO.siteUrl}${path}`;
