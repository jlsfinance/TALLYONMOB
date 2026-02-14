/**
 * Backup Routes - Data export and backup endpoints
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const crypto = require('crypto');

// GET /backup/export/:companyId - Export company data as JSON
router.get('/export/:companyId', async (req, res) => {
    try {
        const companyId = req.params.companyId;
        const { tables } = req.query;
        const tablesToExport = tables ? tables.split(',') : ['ledgers', 'vouchers', 'sales', 'purchases', 'stock'];

        const exportData = {
            exportedAt: new Date().toISOString(),
            companyId,
            version: '1.0',
            data: {}
        };

        for (const table of tablesToExport) {
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .eq('company_id', companyId);

            if (error) {
                logger.warn(`Export failed for table ${table}:`, error.message);
                exportData.data[table] = { error: error.message, count: 0 };
            } else {
                exportData.data[table] = { records: data || [], count: (data || []).length };
            }
        }

        // Log the backup
        await supabase.from('backup_logs').insert({
            id: crypto.randomUUID(),
            company_id: companyId,
            type: 'export',
            tables_exported: tablesToExport,
            status: 'success',
            created_at: new Date().toISOString()
        }).catch(() => { }); // Non-critical

        res.json({ success: true, data: exportData });
    } catch (error) {
        logger.error('GET /backup/export Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /backup/export-csv/:companyId/:table - Export single table as CSV
router.get('/export-csv/:companyId/:table', async (req, res) => {
    try {
        const { companyId, table } = req.params;

        const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('company_id', companyId);

        if (error) throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ success: false, error: 'No data found' });
        }

        // Convert to CSV
        const headers = Object.keys(data[0]).filter(k => k !== 'raw_data');
        const csvRows = [headers.join(',')];

        for (const row of data) {
            const values = headers.map(h => {
                const val = row[h];
                if (val === null || val === undefined) return '';
                const str = String(val).replace(/"/g, '""');
                return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
            });
            csvRows.push(values.join(','));
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${table}_export.csv`);
        res.send(csvRows.join('\n'));
    } catch (error) {
        logger.error('GET /backup/export-csv Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /backup/restore/:companyId - Restore data from backup
router.post('/restore/:companyId', async (req, res) => {
    try {
        const companyId = req.params.companyId;
        const { data: backupData } = req.body;

        if (!backupData || typeof backupData !== 'object') {
            return res.status(400).json({ success: false, error: 'Invalid backup data format' });
        }

        const results = {};

        for (const [table, tableData] of Object.entries(backupData)) {
            if (!tableData.records || !Array.isArray(tableData.records)) continue;

            try {
                // Ensure all records belong to this company
                const records = tableData.records.map(r => ({
                    ...r,
                    company_id: companyId
                }));

                const { error } = await supabase
                    .from(table)
                    .upsert(records, { onConflict: 'id', ignoreDuplicates: false });

                if (error) {
                    results[table] = { success: false, error: error.message };
                } else {
                    results[table] = { success: true, count: records.length };
                }
            } catch (err) {
                results[table] = { success: false, error: err.message };
            }
        }

        // Log the restore
        await supabase.from('backup_logs').insert({
            id: crypto.randomUUID(),
            company_id: companyId,
            type: 'restore',
            tables_exported: Object.keys(backupData),
            status: 'success',
            created_at: new Date().toISOString()
        }).catch(() => { });

        res.json({ success: true, results });
    } catch (error) {
        logger.error('POST /backup/restore Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /backup/history/:companyId - Get backup history
router.get('/history/:companyId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('backup_logs')
            .select('*')
            .eq('company_id', req.params.companyId)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        logger.error('GET /backup/history Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
