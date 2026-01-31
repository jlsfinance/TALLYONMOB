/**
 * Enhanced SyncService - Complete sync operations with logging and state tracking
 * Production-grade sync engine with incremental sync support
 */

const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const { SYNC_STATUS, MAX_SYNC_BATCH_SIZE } = require('../config/constants');

class SyncService {
    /**
     * Main sync collection method with enhanced features
     * @param {string} companyId - Company ID
     * @param {string} table - Table to sync to
     * @param {Array} data - Array of records
     * @param {Object} options - Sync options
     */
    static async syncCollection(companyId, table, data, options = {}) {
        const {
            isIncremental = false,
            syncLogId = null
        } = options;

        if (!Array.isArray(data) || data.length === 0) {
            return { count: 0, success: true };
        }

        const startTime = Date.now();
        let successCount = 0;
        let failedCount = 0;
        const errors = [];

        try {
            // Process in batches
            const batches = this.chunkArray(data, MAX_SYNC_BATCH_SIZE);

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];

                // Transform data to ensure company_id and proper formatting
                const formattedData = batch.map(item => this.transformRecord(item, companyId, table));

                try {
                    const { error } = await supabase
                        .from(table)
                        .upsert(formattedData, {
                            onConflict: 'id',
                            ignoreDuplicates: false
                        });

                    if (error) {
                        logger.error(`Batch ${i + 1} failed for ${table}:`, error);
                        failedCount += batch.length;
                        errors.push({
                            batch: i + 1,
                            error: error.message
                        });
                    } else {
                        successCount += batch.length;
                    }
                } catch (batchError) {
                    logger.error(`Batch ${i + 1} exception for ${table}:`, batchError);
                    failedCount += batch.length;
                    errors.push({
                        batch: i + 1,
                        error: batchError.message
                    });
                }
            }

            const duration = Date.now() - startTime;

            // Update sync state if incremental
            if (isIncremental && data.length > 0) {
                await this.updateSyncState(companyId, table, data);
            }

            const result = {
                count: successCount,
                failed: failedCount,
                total: data.length,
                duration,
                success: failedCount === 0,
                errors: errors.length > 0 ? errors : undefined
            };

            logger.info(`Synced ${successCount}/${data.length} records to ${table} for company ${companyId} in ${duration}ms`);

            return result;
        } catch (error) {
            logger.error(`SyncService.syncCollection failed for ${table}:`, error);
            throw error;
        }
    }

    /**
     * Transform record based on table type
     */
    static transformRecord(item, companyId, table) {
        const base = {
            company_id: companyId,
            synced_at: new Date().toISOString(),
            id: item.id || item.guid || item.remoteId || uuidv4()
        };

        switch (table) {
            case 'ledgers':
                return {
                    ...base,
                    name: item.name,
                    alias: item.alias,
                    parent_group: item.parentGroup || item.parent_group || item.ledgerGroup,
                    ledger_group: item.ledgerGroup || item.ledger_group,
                    opening_balance: parseFloat(item.openingBalance) || 0,
                    closing_balance: parseFloat(item.closingBalance) || 0,
                    credit_period: item.creditPeriod,
                    credit_limit: parseFloat(item.creditLimit) || null,
                    address: item.address,
                    phone: item.phone,
                    email: item.email,
                    gstin: item.gstin || item.gstNumber,
                    pan: item.pan,
                    master_id: item.masterId,
                    alter_id: item.alterId,
                    raw_data: item.rawData || item
                };

            case 'vouchers':
                return {
                    ...base,
                    voucher_number: item.voucherNumber || item.number,
                    voucher_type: item.voucherType || item.type,
                    vch_date: item.vchDate || item.date,
                    reference_number: item.referenceNumber,
                    reference_date: item.referenceDate,
                    party_ledger_id: item.partyLedgerId,
                    party_ledger_name: item.partyLedgerName || item.partyName,
                    amount: parseFloat(item.amount) || 0,
                    is_invoice: item.isInvoice || false,
                    is_cancelled: item.isCancelled || false,
                    narration: item.narration,
                    guid: item.guid,
                    master_id: item.masterId,
                    alter_id: item.alterId,
                    raw_data: item.rawData || item
                };

            case 'sales':
                return {
                    ...base,
                    voucher_id: item.voucherId,
                    invoice_number: item.invoiceNumber || item.vchNumber,
                    invoice_date: item.invoiceDate || item.date,
                    party_ledger_id: item.partyLedgerId,
                    party_ledger_name: item.partyLedgerName || item.partyName,
                    party_gstin: item.partyGstin,
                    place_of_supply: item.placeOfSupply,
                    gross_amount: parseFloat(item.grossAmount) || 0,
                    discount_amount: parseFloat(item.discountAmount) || 0,
                    taxable_amount: parseFloat(item.taxableAmount) || 0,
                    cgst_amount: parseFloat(item.cgstAmount) || 0,
                    sgst_amount: parseFloat(item.sgstAmount) || 0,
                    igst_amount: parseFloat(item.igstAmount) || 0,
                    cess_amount: parseFloat(item.cessAmount) || 0,
                    round_off: parseFloat(item.roundOff) || 0,
                    net_amount: parseFloat(item.netAmount) || parseFloat(item.amount) || 0,
                    is_cancelled: item.isCancelled || false,
                    narration: item.narration,
                    master_id: item.masterId,
                    alter_id: item.alterId,
                    raw_data: item.rawData || item
                };

            case 'purchases':
                return {
                    ...base,
                    voucher_id: item.voucherId,
                    invoice_number: item.invoiceNumber || item.vchNumber,
                    invoice_date: item.invoiceDate || item.date,
                    party_ledger_id: item.partyLedgerId,
                    party_ledger_name: item.partyLedgerName || item.partyName,
                    party_gstin: item.partyGstin,
                    gross_amount: parseFloat(item.grossAmount) || 0,
                    discount_amount: parseFloat(item.discountAmount) || 0,
                    taxable_amount: parseFloat(item.taxableAmount) || 0,
                    cgst_amount: parseFloat(item.cgstAmount) || 0,
                    sgst_amount: parseFloat(item.sgstAmount) || 0,
                    igst_amount: parseFloat(item.igstAmount) || 0,
                    cess_amount: parseFloat(item.cessAmount) || 0,
                    round_off: parseFloat(item.roundOff) || 0,
                    net_amount: parseFloat(item.netAmount) || parseFloat(item.amount) || 0,
                    is_cancelled: item.isCancelled || false,
                    narration: item.narration,
                    master_id: item.masterId,
                    alter_id: item.alterId,
                    raw_data: item.rawData || item
                };

            case 'stock':
                return {
                    ...base,
                    name: item.name || item.itemName,
                    alias: item.alias,
                    stock_group: item.stockGroup,
                    stock_category: item.stockCategory,
                    base_unit: item.baseUnit || item.unit,
                    opening_balance: parseFloat(item.openingBalance) || 0,
                    opening_value: parseFloat(item.openingValue) || 0,
                    inward_quantity: parseFloat(item.inwardQuantity) || 0,
                    inward_value: parseFloat(item.inwardValue) || 0,
                    outward_quantity: parseFloat(item.outwardQuantity) || 0,
                    outward_value: parseFloat(item.outwardValue) || 0,
                    closing_balance: parseFloat(item.closingBalance) || parseFloat(item.closingStock) || 0,
                    closing_value: parseFloat(item.closingValue) || 0,
                    hsn_code: item.hsnCode,
                    gst_rate: parseFloat(item.gstRate) || 0,
                    master_id: item.masterId,
                    alter_id: item.alterId,
                    raw_data: item.rawData || item
                };

            default:
                return {
                    ...base,
                    ...item,
                    raw_data: item.rawData || item
                };
        }
    }

    /**
     * Update sync state for incremental sync tracking
     */
    static async updateSyncState(companyId, dataType, data) {
        try {
            // Find the max alter_id from the synced data
            const maxAlterId = data.reduce((max, item) => {
                const alterId = item.alterId || item.alter_id;
                return alterId && alterId > max ? alterId : max;
            }, '');

            await supabase
                .from('sync_state')
                .upsert({
                    company_id: companyId,
                    data_type: dataType,
                    last_sync_at: new Date().toISOString(),
                    last_alter_id: maxAlterId || null,
                    is_initial_sync_complete: true,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'company_id,data_type' });

        } catch (error) {
            logger.error('SyncService.updateSyncState Error:', error);
            // Don't throw - sync state update is not critical
        }
    }

    /**
     * Get sync state for incremental sync
     */
    static async getSyncState(companyId, dataType) {
        try {
            const { data, error } = await supabase
                .from('sync_state')
                .select('*')
                .eq('company_id', companyId)
                .eq('data_type', dataType)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            return data || null;
        } catch (error) {
            logger.error('SyncService.getSyncState Error:', error);
            return null;
        }
    }

    /**
     * Create sync log entry
     */
    static async createSyncLog(companyId, dataType, syncType = 'incremental') {
        try {
            const { data, error } = await supabase
                .from('sync_logs')
                .insert({
                    id: uuidv4(),
                    company_id: companyId,
                    sync_type: syncType,
                    data_type: dataType,
                    status: SYNC_STATUS.RUNNING,
                    started_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;
            return data.id;
        } catch (error) {
            logger.error('SyncService.createSyncLog Error:', error);
            return null;
        }
    }

    /**
     * Update sync log with results
     */
    static async updateSyncLog(syncLogId, result) {
        if (!syncLogId) return;

        try {
            await supabase
                .from('sync_logs')
                .update({
                    records_synced: result.count || 0,
                    records_failed: result.failed || 0,
                    completed_at: new Date().toISOString(),
                    status: result.success ? SYNC_STATUS.SUCCESS :
                        (result.count > 0 ? SYNC_STATUS.PARTIAL : SYNC_STATUS.FAILED),
                    error_message: result.errors ? JSON.stringify(result.errors) : null,
                    metadata: {
                        duration: result.duration,
                        total: result.total
                    }
                })
                .eq('id', syncLogId);
        } catch (error) {
            logger.error('SyncService.updateSyncLog Error:', error);
        }
    }

    /**
     * Get recent sync logs for a company
     */
    static async getSyncLogs(companyId, limit = 20) {
        try {
            const { data, error } = await supabase
                .from('sync_logs')
                .select('*')
                .eq('company_id', companyId)
                .order('started_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data;
        } catch (error) {
            logger.error('SyncService.getSyncLogs Error:', error);
            return [];
        }
    }

    /**
     * Sync voucher entries (line items)
     */
    static async syncVoucherEntries(companyId, voucherId, entries) {
        if (!entries || entries.length === 0) return { count: 0 };

        try {
            // Delete existing entries for this voucher
            await supabase
                .from('voucher_entries')
                .delete()
                .eq('voucher_id', voucherId);

            // Insert new entries
            const formattedEntries = entries.map(entry => ({
                id: uuidv4(),
                voucher_id: voucherId,
                company_id: companyId,
                ledger_id: entry.ledgerId,
                ledger_name: entry.ledgerName,
                amount: parseFloat(entry.amount) || 0,
                is_debit: entry.isDebit !== undefined ? entry.isDebit : parseFloat(entry.amount) >= 0,
                cost_centre: entry.costCentre
            }));

            const { error } = await supabase
                .from('voucher_entries')
                .insert(formattedEntries);

            if (error) throw error;

            return { count: formattedEntries.length };
        } catch (error) {
            logger.error('SyncService.syncVoucherEntries Error:', error);
            throw error;
        }
    }

    /**
     * Sync sales items (line items)
     */
    static async syncSalesItems(companyId, saleId, items) {
        if (!items || items.length === 0) return { count: 0 };

        try {
            // Delete existing items
            await supabase
                .from('sales_items')
                .delete()
                .eq('sale_id', saleId);

            // Insert new items
            const formattedItems = items.map(item => ({
                id: uuidv4(),
                sale_id: saleId,
                company_id: companyId,
                stock_item_id: item.stockItemId,
                stock_item_name: item.stockItemName || item.itemName,
                quantity: parseFloat(item.quantity) || 0,
                unit: item.unit,
                rate: parseFloat(item.rate) || 0,
                discount_percent: parseFloat(item.discountPercent) || 0,
                amount: parseFloat(item.amount) || 0,
                tax_rate: parseFloat(item.taxRate) || 0,
                hsn_code: item.hsnCode
            }));

            const { error } = await supabase
                .from('sales_items')
                .insert(formattedItems);

            if (error) throw error;

            return { count: formattedItems.length };
        } catch (error) {
            logger.error('SyncService.syncSalesItems Error:', error);
            throw error;
        }
    }

    /**
     * Bulk sync with items (vouchers with entries, sales with items)
     */
    static async syncWithItems(companyId, dataType, records) {
        const results = {
            parentCount: 0,
            itemCount: 0,
            errors: []
        };

        for (const record of records) {
            try {
                // Sync parent record
                await this.syncCollection(companyId, dataType, [record]);
                results.parentCount++;

                // Sync items/entries
                if (dataType === 'vouchers' && record.entries) {
                    const entryResult = await this.syncVoucherEntries(
                        companyId,
                        record.id,
                        record.entries
                    );
                    results.itemCount += entryResult.count;
                } else if (dataType === 'sales' && record.items) {
                    const itemResult = await this.syncSalesItems(
                        companyId,
                        record.id,
                        record.items
                    );
                    results.itemCount += itemResult.count;
                }
            } catch (error) {
                results.errors.push({
                    recordId: record.id,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Helper: Chunk array into batches
     */
    static chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}

module.exports = SyncService;
