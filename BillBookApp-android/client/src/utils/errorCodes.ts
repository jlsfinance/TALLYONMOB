
export const ERROR_CODES = {
    // Auth Errors
    AUTH_LOGIN_FAILED: 'ATH-101',
    AUTH_REGISTER_FAILED: 'ATH-102',
    AUTH_LOGOUT_FAILED: 'ATH-103',
    AUTH_SESSION_EXPIRED: 'ATH-104',

    // Database / Firestore Errors
    DATA_LOAD_FAILED: 'DB-201',
    DATA_SAVE_FAILED: 'DB-202',
    DATA_DELETE_FAILED: 'DB-203',
    DATA_UPDATE_FAILED: 'DB-204',
    DATA_PERMISSION_DENIED: 'DB-403',

    // UI / Application Errors
    APP_CRITICAL_CRASH: 'APP-500',
    UI_NAVIGATION_ERROR: 'UI-301',
    UI_INVALID_INPUT: 'UI-400',

    // Service Errors
    PDF_GENERATION_FAILED: 'SVC-601',
    WHATSAPP_SHARE_FAILED: 'SVC-602',
    NOTIFICATION_FAILED: 'SVC-603',
    IMAGE_UPLOAD_FAILED: 'SVC-604'
};

/**
 * Log error with a specific code and return a formatted message for the user.
 */
export const handleError = (code: keyof typeof ERROR_CODES, error?: any) => {
    const errorCode = ERROR_CODES[code];
    console.error(`[${errorCode}] Error Detail:`, error);

    // In production, we might want to send this to an error tracking service

    return {
        code: errorCode,
        message: `An error occurred (${errorCode}). Please contact support if the problem persists.`,
        originalError: error
    };
};

/**
 * Simple alert with error code
 */
export const showErrorAlert = (code: keyof typeof ERROR_CODES, error?: any) => {
    const { message } = handleError(code, error);
    alert(message);
};
