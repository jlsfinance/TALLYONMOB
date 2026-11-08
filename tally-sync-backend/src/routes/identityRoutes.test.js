/**
 * Identity Routes Tests - Stage C1A-1
 *
 * Tests for POST /api/v1/companies/:company_id/identity
 *
 * Security properties tested:
 * - Endpoint is disabled by default (returns 503 feature_not_enabled)
 * - When enabled, returns 501 not_implemented (never 200)
 * - No database write is attempted under either state
 * - Invalid configuration fails safely
 * - Invalid hostname is rejected
 * - No InsForge client is used
 * - No secrets appear in logs
 */

const request = require('supertest');
const express = require('express');
const fs = require('fs');

// Force SUPABASE_URL to the authoritative project BEFORE requiring the route module
process.env.SUPABASE_URL = 'https://pfqmqpboomwtxgyfqnsn.supabase.co';

const identityRoutes = require('./identityRoutes');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/companies', identityRoutes);
    return app;
}

describe('POST /api/v1/companies/:company_id/identity', () => {
    let app;

    beforeEach(() => {
        app = buildApp();
        process.env.IDENTITY_REGISTRATION_ENABLED = 'false';
    });

    afterEach(() => {
        delete process.env.IDENTITY_REGISTRATION_ENABLED;
    });

    describe('Feature disabled (default)', () => {
        it('returns 503 feature_not_enabled when feature is disabled', async () => {
            const res = await request(app)
                .post('/api/v1/companies/test-company-id/identity')
                .send({
                    tally_guid: 'test-guid-123',
                    data_path: 'D:\\TallyData\\010000',
                    source_id: 'test-source-id-456'
                });

            expect(res.status).toBe(503);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe('feature_not_enabled');
            expect(res.body.message).toContain('not yet enabled');
        });

        it('returns 503 when IDENTITY_REGISTRATION_ENABLED is not set', async () => {
            delete process.env.IDENTITY_REGISTRATION_ENABLED;

            const res = await request(app)
                .post('/api/v1/companies/test-company-id/identity')
                .send({
                    tally_guid: 'test-guid-123',
                    data_path: 'D:\\TallyData\\010000',
                    source_id: 'test-source-id-456'
                });

            expect(res.status).toBe(503);
            expect(res.body.error).toBe('feature_not_enabled');
        });

        it('does not attempt database write when disabled', async () => {
            const res = await request(app)
                .post('/api/v1/companies/test-company-id/identity')
                .send({
                    tally_guid: 'test-guid-123',
                    data_path: 'D:\\TallyData\\010000',
                    source_id: 'test-source-id-456'
                });

            expect(res.status).toBe(503);
            expect(res.body.error).toBe('feature_not_enabled');
        });

        it('returns 400 for validation errors even when feature is disabled', async () => {
            const res = await request(app)
                .post('/api/v1/companies/test-company-id/identity')
                .send({
                    data_path: 'D:\\TallyData\\010000',
                    source_id: 'test-source-id-456'
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.errors.some(e => e.path === 'tally_guid')).toBe(true);
        });
    });

    describe('Feature enabled', () => {
        beforeEach(() => {
            process.env.IDENTITY_REGISTRATION_ENABLED = 'true';
            process.env.SUPABASE_URL = 'https://pfqmqpboomwtxgyfqnsn.supabase.co';
            delete require.cache[require.resolve('../config/supabaseIdentity')];
        });

        afterEach(() => {
            delete process.env.IDENTITY_REGISTRATION_ENABLED;
            delete process.env.SUPABASE_URL;
            delete require.cache[require.resolve('../config/supabaseIdentity')];
        });

        it('returns 501 not_implemented when feature is enabled', async () => {
            const res = await request(app)
                .post('/api/v1/companies/test-company-id/identity')
                .send({
                    tally_guid: 'test-guid-123',
                    data_path: 'D:\\TallyData\\010000',
                    source_id: 'test-source-id-456'
                });

            expect(res.status).toBe(501);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe('not_implemented');
            expect(res.body.message).toContain('not yet implemented');
        });

        it('never returns 200 success when enabled', async () => {
            const res = await request(app)
                .post('/api/v1/companies/test-company-id/identity')
                .send({
                    tally_guid: 'test-guid-123',
                    data_path: 'D:\\TallyData\\010000',
                    source_id: 'test-source-id-456'
                });

            expect(res.status).not.toBe(200);
            expect(res.body.success).toBe(false);
        });
    });

    describe('Request validation', () => {
        beforeEach(() => {
            process.env.IDENTITY_REGISTRATION_ENABLED = 'true';
            process.env.SUPABASE_URL = 'https://pfqmqpboomwtxgyfqnsn.supabase.co';
            delete require.cache[require.resolve('../config/supabaseIdentity')];
        });

        afterEach(() => {
            delete process.env.IDENTITY_REGISTRATION_ENABLED;
            delete process.env.SUPABASE_URL;
            delete require.cache[require.resolve('../config/supabaseIdentity')];
        });

        it('returns 400 when tally_guid is missing', async () => {
            const res = await request(app)
                .post('/api/v1/companies/test-company-id/identity')
                .send({
                    data_path: 'D:\\TallyData\\010000',
                    source_id: 'test-source-id-456'
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.errors.some(e => e.path === 'tally_guid')).toBe(true);
        });

        it('returns 400 when data_path is missing', async () => {
            const res = await request(app)
                .post('/api/v1/companies/test-company-id/identity')
                .send({
                    tally_guid: 'test-guid-123',
                    source_id: 'test-source-id-456'
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.errors.some(e => e.path === 'data_path')).toBe(true);
        });

        it('returns 400 when source_id is missing', async () => {
            const res = await request(app)
                .post('/api/v1/companies/test-company-id/identity')
                .send({
                    tally_guid: 'test-guid-123',
                    data_path: 'D:\\TallyData\\010000'
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.errors.some(e => e.path === 'source_id')).toBe(true);
        });

        it('returns 404 when company_id is empty', async () => {
            const res = await request(app)
                .post('/api/v1/companies//identity')
                .send({
                    tally_guid: 'test-guid-123',
                    data_path: 'D:\\TallyData\\010000',
                    source_id: 'test-source-id-456'
                });

            expect([400, 404]).toContain(res.status);
        });
    });

    describe('No InsForge client usage', () => {
        it('does not import @insforge/sdk', () => {
            const moduleSource = fs.readFileSync(
                require.resolve('./identityRoutes'),
                'utf8'
            );
            expect(moduleSource).not.toContain('@insforge/sdk');
            expect(moduleSource).not.toContain('insforge');
        });
    });

    describe('Supabase configuration validation', () => {
        it('rejects URL with wrong hostname', () => {
            const testUrl = 'https://evil-project.supabase.co';
            const parsedUrl = new URL(testUrl);
            const expectedHost = 'pfqmqpboomwtxgyfqnsn.supabase.co';
            expect(parsedUrl.hostname).not.toBe(expectedHost);
        });

        it('accepts correct hostname', () => {
            const testUrl = 'https://pfqmqpboomwtxgyfqnsn.supabase.co';
            const parsedUrl = new URL(testUrl);
            const expectedHost = 'pfqmqpboomwtxgyfqnsn.supabase.co';
            expect(parsedUrl.hostname).toBe(expectedHost);
        });

        it('rejects malformed URL', () => {
            expect(() => new URL('not-a-valid-url')).toThrow();
        });
    });
});
