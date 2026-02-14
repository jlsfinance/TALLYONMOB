/**
 * AI Routes - Gemini-powered business assistant endpoints
 */

const express = require('express');
const router = express.Router();
const AIService = require('../services/aiService');
const AnalyticsService = require('../services/analyticsService');
const logger = require('../utils/logger');

// POST /ai/query - Ask AI assistant a question
router.post('/query', async (req, res) => {
    try {
        const { companyId, query, language } = req.body;

        if (!companyId || !query) {
            return res.status(400).json({ success: false, error: 'companyId and query required' });
        }

        const result = await AIService.processQuery(companyId, query, language);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('POST /ai/query Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /ai/insights/:companyId - Get smart insights
router.get('/insights/:companyId', async (req, res) => {
    try {
        const insights = await AIService.generateInsights(req.params.companyId);
        res.json({ success: true, data: insights });
    } catch (error) {
        logger.error('GET /ai/insights Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /ai/cash-flow/:companyId - Get cash flow prediction
router.get('/cash-flow/:companyId', async (req, res) => {
    try {
        const { days } = req.query;
        const prediction = await AIService.predictCashFlow(req.params.companyId, parseInt(days) || 30);
        res.json({ success: true, data: prediction });
    } catch (error) {
        logger.error('GET /ai/cash-flow Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /ai/risk-scores/:companyId - Get customer risk scores
router.get('/risk-scores/:companyId', async (req, res) => {
    try {
        const scores = await AIService.getCustomerRiskScores(req.params.companyId);
        res.json({ success: true, data: scores });
    } catch (error) {
        logger.error('GET /ai/risk-scores Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /ai/sales-trend/:companyId - Get sales trend
router.get('/sales-trend/:companyId', async (req, res) => {
    try {
        const { period } = req.query;
        const trend = await AnalyticsService.getSalesTrend(req.params.companyId, period);
        res.json({ success: true, data: trend });
    } catch (error) {
        logger.error('GET /ai/sales-trend Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /ai/reorder-alerts/:companyId - Get stock reorder alerts
router.get('/reorder-alerts/:companyId', async (req, res) => {
    try {
        const alerts = await AnalyticsService.getReorderAlerts(req.params.companyId);
        res.json({ success: true, data: alerts });
    } catch (error) {
        logger.error('GET /ai/reorder-alerts Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /ai/inactive-customers/:companyId - Get inactive customers
router.get('/inactive-customers/:companyId', async (req, res) => {
    try {
        const { days } = req.query;
        const customers = await AnalyticsService.getInactiveCustomers(req.params.companyId, parseInt(days) || 60);
        res.json({ success: true, data: customers });
    } catch (error) {
        logger.error('GET /ai/inactive-customers Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /ai/gst-summary/:companyId - Get GST summary
router.get('/gst-summary/:companyId', async (req, res) => {
    try {
        const { month, year } = req.query;
        const now = new Date();
        const m = parseInt(month) || (now.getMonth() + 1);
        const y = parseInt(year) || now.getFullYear();

        const summary = await AnalyticsService.getGSTSummary(req.params.companyId, m, y);
        res.json({ success: true, data: summary });
    } catch (error) {
        logger.error('GET /ai/gst-summary Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
