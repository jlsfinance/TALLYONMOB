import { gapi } from 'gapi-script';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';
import { DRIVE_CONFIG, BackupFrequency, BACKUP_FREQUENCY } from '../config/driveConfig';
import { StorageService } from './storageService';
import type { Invoice, Customer, Product, Payment, CompanyProfile } from '../types';

interface BackupData {
    version: string;
    timestamp: string;
    appVersion: string;
    data: {
        invoices: Invoice[];
        customers: Customer[];
        products: Product[];
        payments: Payment[];
        expenses: any[];
        company: CompanyProfile;
    };
}

interface BackupMetadata {
    id: string;
    name: string;
    createdTime: string;
    size: number;
}

class DriveBackupService {
    private isInitialized = false;
    private accessToken: string | null = null;
    private appFolderId: string | null = null;
    private isWebPlatform = !Capacitor.isNativePlatform();

    /**
     * Initialize Google Drive API and authenticate
     */
    async initialize(): Promise<boolean> {
        try {
            if (this.isWebPlatform) {
                return await this.initializeWeb();
            } else {
                return await this.initializeNative();
            }
        } catch (error) {
            console.error('Drive initialization failed:', error);
            return false;
        }
    }

    /**
     * Initialize for web browser using gapi OAuth
     */
    private async initializeWeb(): Promise<boolean> {
        try {
            console.log('Initializing Google Drive for web...');

            // Load gapi client and auth2
            await new Promise<void>((resolve, reject) => {
                gapi.load('client:auth2', () => resolve(), (err: any) => reject(err));
            });

            // Initialize gapi client
            await gapi.client.init({
                apiKey: DRIVE_CONFIG.apiKey,
                clientId: DRIVE_CONFIG.clientId,
                scope: DRIVE_CONFIG.scope,
                discoveryDocs: DRIVE_CONFIG.discoveryDocs,
            });

            // Get auth instance
            const authInstance = gapi.auth2.getAuthInstance();

            // Check if already signed in
            if (!authInstance.isSignedIn.get()) {
                // Sign in with popup
                const googleUser = await authInstance.signIn();
                const authResponse = googleUser.getAuthResponse();
                this.accessToken = authResponse.access_token;
            } else {
                const googleUser = authInstance.currentUser.get();
                const authResponse = googleUser.getAuthResponse();
                this.accessToken = authResponse.access_token;
            }

            if (!this.accessToken) {
                throw new Error('No access token received from Google');
            }

            console.log('Web OAuth successful, token received');

            // Get or create app folder
            await this.ensureAppFolder();

            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Web Drive initialization failed:', error);
            // Show user-friendly message for web platform
            throw new Error('Cloud backup is currently only available on the mobile app. Please use the Android or iOS app to enable Google Drive backup.');
        }
    }

    /**
     * Initialize for native platform using Capacitor GoogleAuth
     */
    private async initializeNative(): Promise<boolean> {
        try {
            console.log('Initializing Google Drive for native...');

            // Get Google Auth token from Capacitor plugin
            const result = await GoogleAuth.signIn();

            if (!result.authentication?.accessToken) {
                throw new Error('No access token received');
            }

            this.accessToken = result.authentication.accessToken;

            // Initialize gapi client
            await new Promise<void>((resolve) => {
                gapi.load('client', async () => {
                    await gapi.client.init({
                        apiKey: DRIVE_CONFIG.apiKey,
                        discoveryDocs: DRIVE_CONFIG.discoveryDocs,
                    });

                    // Set access token
                    gapi.client.setToken({ access_token: this.accessToken! });
                    resolve();
                });
            });

            // Get or create app folder
            await this.ensureAppFolder();

            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Native Drive initialization failed:', error);
            return false;
        }
    }

    /**
     * Ensure backup folder exists in Drive
     */
    private async ensureAppFolder(): Promise<void> {
        try {
            // Search for existing folder
            const response = await gapi.client.drive.files.list({
                q: `name='${DRIVE_CONFIG.appFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id, name)',
                spaces: 'drive',
            });

            if (response.result.files && response.result.files.length > 0) {
                this.appFolderId = response.result.files[0].id!;
            } else {
                // Create folder
                const folderMetadata = {
                    name: DRIVE_CONFIG.appFolderName,
                    mimeType: 'application/vnd.google-apps.folder',
                };

                const folder = await gapi.client.drive.files.create({
                    resource: folderMetadata,
                    fields: 'id',
                });

                this.appFolderId = folder.result.id!;
            }
        } catch (error) {
            console.error('Error ensuring app folder:', error);
            throw error;
        }
    }

    /**
     * Create a backup of all app data
     */
    async createBackup(description?: string): Promise<BackupMetadata | null> {
        try {
            if (!this.isInitialized) {
                const initialized = await this.initialize();
                if (!initialized) return null;
            }

            // Collect all data
            const backupData: BackupData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                appVersion: '1.8.0',
                data: {
                    invoices: StorageService.getInvoices(),
                    customers: StorageService.getCustomers(),
                    products: StorageService.getProducts(),
                    payments: StorageService.getPayments(),
                    expenses: StorageService.getExpenses(),
                    company: StorageService.getCompanyProfile(),
                },
            };

            // Create filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `${DRIVE_CONFIG.backupPrefix}${timestamp}${DRIVE_CONFIG.backupExtension}`;

            // Upload to Drive
            const fileMetadata = {
                name: fileName,
                parents: [this.appFolderId!],
                description: description || 'BillBook App Backup',
            };

            const file = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
            form.append('file', file);

            const response = await fetch(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,size',
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                    },
                    body: form,
                }
            );

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const result = await response.json();

            // Cleanup old backups
            await this.cleanupOldBackups();

            // Store last backup time
            localStorage.setItem('lastBackupTime', new Date().toISOString());

            return {
                id: result.id,
                name: result.name,
                createdTime: result.createdTime,
                size: result.size,
            };
        } catch (error) {
            console.error('Backup creation failed:', error);
            return null;
        }
    }

    /**
     * List all available backups
     */
    async listBackups(): Promise<BackupMetadata[]> {
        try {
            if (!this.isInitialized) {
                const initialized = await this.initialize();
                if (!initialized) return [];
            }

            const response = await gapi.client.drive.files.list({
                q: `'${this.appFolderId}' in parents and name contains '${DRIVE_CONFIG.backupPrefix}' and trashed=false`,
                fields: 'files(id, name, createdTime, size)',
                orderBy: 'createdTime desc',
                spaces: 'drive',
            });

            return (response.result.files || []).map((file: any) => ({
                id: file.id,
                name: file.name,
                createdTime: file.createdTime,
                size: file.size,
            }));
        } catch (error) {
            console.error('Failed to list backups:', error);
            return [];
        }
    }

    /**
     * Restore data from a backup
     */
    async restoreBackup(backupId: string, mergeMode: 'replace' | 'merge' = 'replace'): Promise<boolean> {
        try {
            if (!this.isInitialized) {
                const initialized = await this.initialize();
                if (!initialized) return false;
            }

            // Create a backup of current data before restore
            await this.createBackup('Pre-restore backup');

            // Download backup file
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files/${backupId}?alt=media`,
                {
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                    },
                }
            );

            if (!response.ok) {
                throw new Error('Failed to download backup');
            }

            const backupData: BackupData = await response.json();

            if (mergeMode === 'replace') {
                // Replace all data
                localStorage.clear();

                // Restore data
                backupData.data.invoices.forEach(invoice => StorageService.saveInvoice(invoice));
                backupData.data.customers.forEach(customer => StorageService.saveCustomer(customer));
                backupData.data.products.forEach(product => StorageService.saveProduct(product));
                backupData.data.payments.forEach(payment => StorageService.savePayment(payment));
                backupData.data.expenses?.forEach(expense => StorageService.saveExpense(expense));

                if (backupData.data.company) {
                    StorageService.saveCompanyProfile(backupData.data.company);
                }
            } else {
                // Merge mode - add items that don't exist
                const existingInvoiceIds = new Set(StorageService.getInvoices().map(i => i.id));
                const existingCustomerIds = new Set(StorageService.getCustomers().map(c => c.id));
                const existingProductIds = new Set(StorageService.getProducts().map(p => p.id));
                const existingPaymentIds = new Set(StorageService.getPayments().map(p => p.id));

                backupData.data.invoices.forEach(invoice => {
                    if (!existingInvoiceIds.has(invoice.id)) {
                        StorageService.saveInvoice(invoice);
                    }
                });

                backupData.data.customers.forEach(customer => {
                    if (!existingCustomerIds.has(customer.id)) {
                        StorageService.saveCustomer(customer);
                    }
                });

                backupData.data.products.forEach(product => {
                    if (!existingProductIds.has(product.id)) {
                        StorageService.saveProduct(product);
                    }
                });

                backupData.data.payments.forEach(payment => {
                    if (!existingPaymentIds.has(payment.id)) {
                        StorageService.savePayment(payment);
                    }
                });
            }

            // Store last restore time
            localStorage.setItem('lastRestoreTime', new Date().toISOString());
            localStorage.setItem('lastRestoreBackupId', backupId);

            return true;
        } catch (error) {
            console.error('Restore failed:', error);
            return false;
        }
    }

    /**
     * Delete a backup file
     */
    async deleteBackup(backupId: string): Promise<boolean> {
        try {
            if (!this.isInitialized) {
                const initialized = await this.initialize();
                if (!initialized) return false;
            }

            await gapi.client.drive.files.delete({
                fileId: backupId,
            });

            return true;
        } catch (error) {
            console.error('Failed to delete backup:', error);
            return false;
        }
    }

    /**
     * Cleanup old backups (keep only last N backups)
     */
    private async cleanupOldBackups(): Promise<void> {
        try {
            const backups = await this.listBackups();

            if (backups.length > DRIVE_CONFIG.maxBackups) {
                // Delete oldest backups
                const toDelete = backups.slice(DRIVE_CONFIG.maxBackups);

                for (const backup of toDelete) {
                    await this.deleteBackup(backup.id);
                }
            }
        } catch (error) {
            console.error('Cleanup failed:', error);
        }
    }

    /**
     * Get backup frequency setting
     */
    getBackupFrequency(): BackupFrequency {
        return (localStorage.getItem('backupFrequency') as BackupFrequency) || BACKUP_FREQUENCY.MANUAL;
    }

    /**
     * Set backup frequency
     */
    setBackupFrequency(frequency: BackupFrequency): void {
        localStorage.setItem('backupFrequency', frequency);
    }

    /**
     * Check if auto-backup is due
     */
    isAutoBackupDue(): boolean {
        const frequency = this.getBackupFrequency();

        if (frequency === BACKUP_FREQUENCY.MANUAL) {
            return false;
        }

        const lastBackupTime = localStorage.getItem('lastBackupTime');
        if (!lastBackupTime) {
            return true;
        }

        const lastBackup = new Date(lastBackupTime).getTime();
        const now = Date.now();
        const timeDiff = now - lastBackup;

        if (frequency === BACKUP_FREQUENCY.DAILY) {
            return timeDiff >= 24 * 60 * 60 * 1000; // 24 hours
        } else if (frequency === BACKUP_FREQUENCY.WEEKLY) {
            return timeDiff >= 7 * 24 * 60 * 60 * 1000; // 7 days
        }

        return false;
    }

    /**
     * Get last backup timestamp
     */
    getLastBackupTime(): string | null {
        return localStorage.getItem('lastBackupTime');
    }

    /**
     * Check if user is authenticated with Drive
     */
    isAuthenticated(): boolean {
        return this.isInitialized && this.accessToken !== null;
    }

    /**
     * Sign out from Drive
     */
    async signOut(): Promise<void> {
        try {
            if (this.isWebPlatform) {
                // Web platform sign out
                const authInstance = gapi.auth2.getAuthInstance();
                if (authInstance) {
                    await authInstance.signOut();
                }
            } else {
                // Native platform sign out
                await GoogleAuth.signOut();
            }
            this.isInitialized = false;
            this.accessToken = null;
            this.appFolderId = null;
        } catch (error) {
            console.error('Sign out failed:', error);
        }
    }
}

export const driveBackupService = new DriveBackupService();
