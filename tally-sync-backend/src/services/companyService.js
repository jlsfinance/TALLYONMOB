/**
 * CompanyService - Company management operations
 * Handles company CRUD and user-company associations
 */

const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

class CompanyService {
    /**
     * Create or update a company (during sync)
     */
    static async upsertCompany(companyData) {
        try {
            const { data, error } = await supabase
                .from('companies')
                .upsert({
                    id: companyData.id,
                    name: companyData.name,
                    formal_name: companyData.formalName || companyData.name,
                    address: companyData.address,
                    email: companyData.email,
                    phone: companyData.phone,
                    financial_year_start: companyData.financialYearStart,
                    financial_year_end: companyData.financialYearEnd,
                    currency_symbol: companyData.currencySymbol || '₹',
                    is_active: true,
                    last_sync_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' });

            if (error) throw error;

            logger.info(`Company upserted: ${companyData.name} (${companyData.id})`);
            return data;
        } catch (error) {
            logger.error('CompanyService.upsertCompany Error:', error);
            throw error;
        }
    }

    /**
     * Get company by ID
     */
    static async getCompanyById(companyId) {
        try {
            const { data, error } = await supabase
                .from('companies')
                .select('*')
                .eq('id', companyId)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            logger.error('CompanyService.getCompanyById Error:', error);
            throw error;
        }
    }

    /**
     * Get companies for a user
     */
    static async getCompaniesForUser(userId) {
        try {
            const { data, error } = await supabase
                .from('company_users')
                .select(`
                    company_id,
                    role,
                    can_sync,
                    companies (
                        id,
                        name,
                        formal_name,
                        last_sync_at,
                        is_active
                    )
                `)
                .eq('user_id', userId);

            if (error) throw error;

            // Flatten the response
            return data.map(cu => ({
                ...cu.companies,
                userRole: cu.role,
                canSync: cu.can_sync
            }));
        } catch (error) {
            logger.error('CompanyService.getCompaniesForUser Error:', error);
            throw error;
        }
    }

    /**
     * Add user to company
     */
    static async addUserToCompany(companyId, userId, role = 'viewer') {
        try {
            const { data, error } = await supabase
                .from('company_users')
                .insert({
                    company_id: companyId,
                    user_id: userId,
                    role: role,
                    can_sync: role === 'owner' || role === 'admin'
                });

            if (error) throw error;

            logger.info(`User ${userId} added to company ${companyId} as ${role}`);
            return data;
        } catch (error) {
            logger.error('CompanyService.addUserToCompany Error:', error);
            throw error;
        }
    }

    /**
     * Check if user has access to company
     */
    static async checkUserAccess(companyId, userId) {
        try {
            const { data, error } = await supabase
                .from('company_users')
                .select('role, can_sync')
                .eq('company_id', companyId)
                .eq('user_id', userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    // No rows returned
                    return { hasAccess: false };
                }
                throw error;
            }

            return {
                hasAccess: true,
                role: data.role,
                canSync: data.can_sync
            };
        } catch (error) {
            logger.error('CompanyService.checkUserAccess Error:', error);
            throw error;
        }
    }

    /**
     * Generate API key for company sync
     */
    static async generateSyncApiKey(companyId) {
        try {
            // Generate a secure random API key
            const apiKey = `tsk_${uuidv4().replace(/-/g, '')}_${Date.now()}`;
            const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

            const { data, error } = await supabase
                .from('companies')
                .update({
                    sync_api_key: apiKey,
                    sync_api_key_hash: apiKeyHash,
                    updated_at: new Date().toISOString()
                })
                .eq('id', companyId)
                .select('sync_api_key');

            if (error) throw error;

            logger.info(`New sync API key generated for company ${companyId}`);

            // Return the plain key (only shown once)
            return { apiKey };
        } catch (error) {
            logger.error('CompanyService.generateSyncApiKey Error:', error);
            throw error;
        }
    }

    /**
     * Validate sync API key
     */
    static async validateSyncApiKey(apiKey) {
        try {
            const { data, error } = await supabase
                .from('companies')
                .select('id, name, is_active')
                .eq('sync_api_key', apiKey)
                .single();

            if (error || !data) {
                return { valid: false };
            }

            if (!data.is_active) {
                return { valid: false, reason: 'Company is inactive' };
            }

            return {
                valid: true,
                companyId: data.id,
                companyName: data.name
            };
        } catch (error) {
            logger.error('CompanyService.validateSyncApiKey Error:', error);
            return { valid: false };
        }
    }

    /**
     * Update last sync timestamp
     */
    static async updateLastSync(companyId) {
        try {
            const { error } = await supabase
                .from('companies')
                .update({
                    last_sync_at: new Date().toISOString()
                })
                .eq('id', companyId);

            if (error) throw error;
        } catch (error) {
            logger.error('CompanyService.updateLastSync Error:', error);
            throw error;
        }
    }

    /**
     * Get all active companies (for admin)
     */
    static async getAllCompanies() {
        try {
            const { data, error } = await supabase
                .from('companies')
                .select('*')
                .eq('is_active', true)
                .order('name');

            if (error) throw error;
            return data;
        } catch (error) {
            logger.error('CompanyService.getAllCompanies Error:', error);
            throw error;
        }
    }

    /**
     * Deactivate a company
     */
    static async deactivateCompany(companyId) {
        try {
            const { error } = await supabase
                .from('companies')
                .update({
                    is_active: false,
                    sync_api_key: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', companyId);

            if (error) throw error;

            logger.info(`Company ${companyId} deactivated`);
        } catch (error) {
            logger.error('CompanyService.deactivateCompany Error:', error);
            throw error;
        }
    }
}

module.exports = CompanyService;
