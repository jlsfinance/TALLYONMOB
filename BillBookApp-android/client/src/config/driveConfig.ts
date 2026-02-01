// Google Drive API Configuration

export const DRIVE_CONFIG = {
    // Google Drive API Configuration
    apiKey: (import.meta as any).env?.VITE_GOOGLE_API_KEY || 'AIzaSyB1YAST1Kkl_v3sGhtwahN4c_ExZHa4sLA',
    clientId: (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '231225025529-fsoqcbbggrk0hu3kfpvsmdj54j4gt2e5.apps.googleusercontent.com',

    // Drive API scopes - only file scope for security
    scope: 'https://www.googleapis.com/auth/drive.file',

    // Discovery docs for Drive API v3
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],

    // App folder name in user's Drive
    appFolderName: 'BillBook Backups',

    // Backup file naming
    backupPrefix: 'backup_',
    backupExtension: '.json',

    // Auto-backup settings
    maxBackups: 10, // Keep last 10 backups
    autoBackupInterval: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
};

export const BACKUP_FREQUENCY = {
    MANUAL: 'manual',
    DAILY: 'daily',
    WEEKLY: 'weekly',
} as const;

export type BackupFrequency = typeof BACKUP_FREQUENCY[keyof typeof BACKUP_FREQUENCY];
