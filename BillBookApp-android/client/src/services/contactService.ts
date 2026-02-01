
import { StorageService } from './storageService';

export const ContactService = {
    normalizePhone: (num: string) => num.replace(/\D/g, '').slice(-10),

    // Replaced with no-op as native contact access is removed
    pickContact: async (): Promise<{ name: string; phone: string } | null> => {
        return null; // Feature removed
    },

    // No-op: Native contact permissions removed for compliance
    requestPermissions: async (): Promise<void> => {
        // Feature removed for Google Play compliance
        return;
    },

    getContactNameFromPhone: async (inputNumber: string): Promise<string> => {
        const cleaned = ContactService.normalizePhone(inputNumber);

        // Only check DB
        const existing = StorageService.getCustomers().find(c => ContactService.normalizePhone(c.phone) === cleaned);
        if (existing) {
            return existing.name;
        }
        return '';
    },

    getCombinedContacts: async (query: string): Promise<Array<{ id: string; name: string; phone: string; source: 'db' | 'phone' }>> => {
        const results: Array<{ id: string; name: string; phone: string; source: 'db' | 'phone' }> = [];
        const q = query.toLowerCase().trim();

        // 1. Get DB Contacts ONLY
        const dbCustomers = StorageService.getCustomers();
        dbCustomers.forEach(c => {
            if (c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))) {
                results.push({ id: c.id, name: c.name, phone: c.phone, source: 'db' });
            }
        });

        // 2. Device Contacts removed per policy

        // De-duplicate by phone
        const seen = new Set();
        return results.filter(item => {
            const normalized = ContactService.normalizePhone(item.phone);
            if (seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
        }).slice(0, 50);
    },

    resolveName: async (number: string): Promise<{ name: string; source: 'db' | 'phone' | 'manual' }> => {
        const cleaned = ContactService.normalizePhone(number);
        if (cleaned.length < 10) return { name: '', source: 'manual' };

        // 1. App Database
        const existing = StorageService.getCustomers().find(c => ContactService.normalizePhone(c.phone) === cleaned);
        if (existing) {
            return { name: existing.name, source: 'db' };
        }

        // 2. Phone Contacts removed

        return { name: '', source: 'manual' };
    }
};
