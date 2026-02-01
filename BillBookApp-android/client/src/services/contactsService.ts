/**
 * Contacts Service - Privacy-Compliant Contact Suggestions
 * 
 * COMPLIANCE NOTES:
 * - Contacts are read ONLY when user explicitly types in customer name field
 * - NO bulk contact upload to server
 * - NO background contact syncing
 * - Permission requested before first use
 * - Clear disclosure in Privacy Policy and Runtime Modal
 */

import { Contacts } from '@capacitor-community/contacts';
import { ContactSuggestion } from '../types';

class ContactsServiceClass {
    private hasPermission: boolean = false;
    private contactCache: ContactSuggestion[] = [];
    private cacheExpiry: number = 0;

    /**
     * Request contacts permission
     */
    async requestPermission(): Promise<boolean> {
        try {
            const result = await Contacts.requestPermissions();
            this.hasPermission = result.contacts === 'granted';
            return this.hasPermission;
        } catch (error) {
            console.warn('Contacts permission not available:', error);
            return false;
        }
    }

    /**
     * Legacy method for compatibility
     */
    async requestWithDisclosure(): Promise<boolean> {
        return this.requestPermission();
    }

    /**
     * Check if permission is granted
     */
    async checkPermission(): Promise<boolean> {
        try {
            const result = await Contacts.checkPermissions();
            this.hasPermission = result.contacts === 'granted';
            return this.hasPermission;
        } catch (error) {
            return false;
        }
    }

    /**
     * Search contacts by name (local only, no server upload)
     * @param query - Name to search for
     * @returns Array of contact suggestions
     */
    async searchContacts(query: string): Promise<ContactSuggestion[]> {
        if (!query || query.length < 2) return [];

        // Check permission first
        const hasPermission = await this.checkPermission();
        if (!hasPermission) {
            return [];
        }

        try {
            // Use cache if available and fresh (5 minutes)
            const now = Date.now();
            if (this.contactCache.length > 0 && now < this.cacheExpiry) {
                return this.filterContacts(this.contactCache, query);
            }

            // Fetch contacts
            const result = await Contacts.getContacts({
                projection: {
                    name: true,
                    phones: true
                }
            });

            // Transform to our format
            const contacts: ContactSuggestion[] = [];
            for (const contact of result.contacts) {
                const name = contact.name?.display || contact.name?.given || '';
                const phone = contact.phones?.[0]?.number || '';

                if (name && phone) {
                    contacts.push({ name, phone });
                }
            }

            // Cache for 5 minutes
            this.contactCache = contacts;
            this.cacheExpiry = now + (5 * 60 * 1000);

            return this.filterContacts(contacts, query);
        } catch (error) {
            console.error('Error fetching contacts:', error);
            // In case of error, just return empty, don't crash
            return [];
        }
    }

    /**
     * Filter contacts by query (case-insensitive)
     */
    private filterContacts(contacts: ContactSuggestion[], query: string): ContactSuggestion[] {
        const lowerQuery = query.toLowerCase();
        return contacts
            .filter(c => c.name.toLowerCase().includes(lowerQuery))
            .slice(0, 10); // Limit to 10 suggestions
    }

    /**
     * Filter contacts by phone number
     */
    private filterContactsByPhone(contacts: ContactSuggestion[], query: string): ContactSuggestion[] {
        const cleanedQuery = query.replace(/\D/g, '');
        if (cleanedQuery.length < 3) return [];
        return contacts
            .filter(c => {
                const cleanedPhone = c.phone.replace(/\D/g, '');
                return cleanedPhone.includes(cleanedQuery);
            })
            .slice(0, 10); // Limit to 10 suggestions
    }

    /**
     * Search contacts by phone number (local only, no server upload)
     * @param phoneQuery - Phone number to search for
     * @returns Array of contact suggestions
     */
    async searchByPhone(phoneQuery: string): Promise<ContactSuggestion[]> {
        const cleaned = phoneQuery.replace(/\D/g, '');
        if (cleaned.length < 3) return [];

        // Check permission first
        const hasPermission = await this.checkPermission();
        if (!hasPermission) {
            return [];
        }

        try {
            // Use cache if available and fresh (5 minutes)
            const now = Date.now();
            if (this.contactCache.length > 0 && now < this.cacheExpiry) {
                return this.filterContactsByPhone(this.contactCache, phoneQuery);
            }

            // Fetch contacts
            const result = await Contacts.getContacts({
                projection: {
                    name: true,
                    phones: true
                }
            });

            // Transform to our format
            const contacts: ContactSuggestion[] = [];
            for (const contact of result.contacts) {
                const name = contact.name?.display || contact.name?.given || '';
                const phone = contact.phones?.[0]?.number || '';

                if (name && phone) {
                    contacts.push({ name, phone });
                }
            }

            // Cache for 5 minutes
            this.contactCache = contacts;
            this.cacheExpiry = now + (5 * 60 * 1000);

            return this.filterContactsByPhone(contacts, phoneQuery);
        } catch (error) {
            console.error('Error fetching contacts:', error);
            return [];
        }
    }

    /**
     * Pick a single contact from native contact picker
     * This uses the proper Android Contact Picker intent for single contact selection
     * Compliant with Google Play 2026 policies - no bulk access required
     */
    async pickContact(): Promise<ContactSuggestion | null> {
        try {
            const result = await Contacts.pickContact({
                projection: {
                    name: true,
                    phones: true
                }
            });

            if (result.contact) {
                const name = result.contact.name?.display || result.contact.name?.given || '';
                const phone = result.contact.phones?.[0]?.number || '';
                if (name || phone) {
                    return {
                        name: name || 'Unknown',
                        phone: phone.replace(/\D/g, '').slice(-10)
                    };
                }
            }
            return null;
        } catch (error) {
            console.warn('Contact pick cancelled or failed:', error);
            return null;
        }
    }

    /**
     * Clear cache (useful when user revokes permission)
     */
    clearCache(): void {
        this.contactCache = [];
        this.cacheExpiry = 0;
    }
}

export const ContactsService = new ContactsServiceClass();
