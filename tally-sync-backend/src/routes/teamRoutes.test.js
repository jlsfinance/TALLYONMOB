const express = require('express');
const request = require('supertest');

// Mock supabaseIdentity BEFORE requiring teamRoutes
const mockDb = {
    auth: {
        getUser: jest.fn(),
        admin: {
            inviteUserByEmail: jest.fn(),
        },
    },
    from: jest.fn(),
};

jest.mock('../config/supabaseIdentity', () => ({
    supabaseIdentity: mockDb,
}));

const teamRoutes = require('./teamRoutes');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/team', teamRoutes);
    return app;
}

/**
 * Minimal Supabase query-builder mock keyed by table name.
 * Records every insert/upsert/update/delete call so tests can assert persistence & audit logging.
 */
function setupMockTables(seed = {}) {
    const state = {
        user_profiles: seed.user_profiles || [],
        companies: seed.companies || [{ id: 'comp-1', name: 'Demo Co', owner_id: 'owner-1' }],
        company_users: seed.company_users || [
            { company_id: 'comp-1', user_id: 'owner-1', role: 'owner', status: 'active' },
            { company_id: 'comp-1', user_id: 'acct-1', role: 'accountant', status: 'active' },
            { company_id: 'comp-1', user_id: 'view-1', role: 'viewer', status: 'active' },
            { company_id: 'comp-1', user_id: 'susp-1', role: 'admin', status: 'suspended' },
        ],
        user_roles: seed.user_roles || [],
        team_invitations: seed.team_invitations || [],
        activity_logs: [],
        writes: [],
    };

    mockDb.from.mockImplementation((table) => {
        const filters = [];
        let op = 'select';
        let payload = null;

        const applyFilters = (rows) =>
            rows.filter((row) =>
                filters.every((f) => {
                    if (f.type === 'eq') return row[f.col] === f.val;
                    if (f.type === 'ilike') return String(row[f.col] || '').toLowerCase() === String(f.val || '').toLowerCase();
                    if (f.type === 'in') return Array.isArray(f.val) && f.val.includes(row[f.col]);
                    return true;
                })
            );

        const exec = async () => {
            const rows = state[table] || [];
            if (op === 'select') {
                return { data: applyFilters(rows), error: null };
            }
            if (op === 'insert') {
                const items = Array.isArray(payload) ? payload : [payload];
                if (table === 'activity_logs') {
                    state.activity_logs.push(...items);
                } else {
                    state[table] = [...rows, ...items];
                }
                state.writes.push({ table, op, payload });
                return { data: items, error: null };
            }
            if (op === 'upsert') {
                state.writes.push({ table, op, payload });
                return { data: [payload], error: null };
            }
            if (op === 'update') {
                state.writes.push({ table, op, payload, filters: [...filters] });
                return { data: applyFilters(rows).map((r) => ({ ...r, ...payload })), error: null };
            }
            if (op === 'delete') {
                state.writes.push({ table, op, filters: [...filters] });
                return { data: null, error: null };
            }
            return { data: [], error: null };
        };

        const builder = {
            select: () => builder,
            insert: (data) => { op = 'insert'; payload = data; return builder; },
            upsert: (data) => { op = 'upsert'; payload = data; return builder; },
            update: (data) => { op = 'update'; payload = data; return builder; },
            delete: () => { op = 'delete'; return builder; },
            eq: (col, val) => { filters.push({ type: 'eq', col, val }); return builder; },
            ilike: (col, val) => { filters.push({ type: 'ilike', col, val }); return builder; },
            in: (col, val) => { filters.push({ type: 'in', col, val }); return builder; },
            order: () => builder,
            single: async () => {
                const res = await exec();
                return { data: Array.isArray(res.data) ? res.data[0] || null : res.data, error: res.error };
            },
            maybeSingle: async () => {
                const res = await exec();
                return { data: Array.isArray(res.data) ? res.data[0] || null : res.data, error: res.error };
            },
            then: (resolve, reject) => exec().then(resolve, reject),
        };
        return builder;
    });

    return state;
}

describe('Team & RBAC Routes Security', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        app = buildApp();
    });

    test('rejects unauthenticated requests (401) across list, invite, role, status, remove', async () => {
        setupMockTables();
        expect((await request(app).get('/api/v1/team/comp-1')).status).toBe(401);
        expect((await request(app).post('/api/v1/team/invite').send({ companyId: 'comp-1', email: 'a@b.com', role: 'viewer' })).status).toBe(401);
        expect((await request(app).put('/api/v1/team/role').send({ companyId: 'comp-1', userId: 'u1', role: 'viewer' })).status).toBe(401);
        expect((await request(app).put('/api/v1/team/status').send({ companyId: 'comp-1', userId: 'u1', status: 'suspended' })).status).toBe(401);
        expect((await request(app).delete('/api/v1/team/remove').send({ companyId: 'comp-1', userId: 'u1' })).status).toBe(401);
        expect(mockDb.auth.getUser).not.toHaveBeenCalled();
    });

    test('rejects invalid JWT token with 401', async () => {
        setupMockTables();
        mockDb.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Invalid JWT') });
        const res = await request(app)
            .get('/api/v1/team/comp-1')
            .set('Authorization', 'Bearer bad-token');
        expect(res.status).toBe(401);
    });

    test('blocks non-member from reading company team (403)', async () => {
        setupMockTables();
        mockDb.auth.getUser.mockResolvedValue({ data: { user: { id: 'outsider-1', email: 'out@co.in' } }, error: null });
        const res = await request(app)
            .get('/api/v1/team/comp-1')
            .set('Authorization', 'Bearer valid');
        expect(res.status).toBe(403);
    });

    test('blocks suspended admin from reading or mutating (403)', async () => {
        setupMockTables();
        mockDb.auth.getUser.mockResolvedValue({ data: { user: { id: 'susp-1', email: 'susp@co.in' } }, error: null });
        expect((await request(app).get('/api/v1/team/comp-1').set('Authorization', 'Bearer valid')).status).toBe(403);
        expect((await request(app).post('/api/v1/team/invite').set('Authorization', 'Bearer valid').send({
            companyId: 'comp-1', email: 'x@y.com', role: 'viewer',
        })).status).toBe(403);
    });

    test('blocks viewer and accountant from invite, role update, status update, remove, bulk, and invitations list (403)', async () => {
        setupMockTables();
        for (const actor of [
            { id: 'view-1', email: 'view@co.in' },
            { id: 'acct-1', email: 'acct@co.in' },
        ]) {
            mockDb.auth.getUser.mockResolvedValue({ data: { user: actor }, error: null });

            expect((await request(app).get('/api/v1/team/invitations/comp-1').set('Authorization', 'Bearer valid')).status).toBe(403);
            expect((await request(app).post('/api/v1/team/invite').set('Authorization', 'Bearer valid').send({
                companyId: 'comp-1', email: 'new@co.in', role: 'viewer',
            })).status).toBe(403);
            expect((await request(app).put('/api/v1/team/role').set('Authorization', 'Bearer valid').send({
                companyId: 'comp-1', userId: 'view-1', role: 'admin',
            })).status).toBe(403);
            expect((await request(app).put('/api/v1/team/status').set('Authorization', 'Bearer valid').send({
                companyId: 'comp-1', userId: 'view-1', status: 'suspended',
            })).status).toBe(403);
            expect((await request(app).delete('/api/v1/team/remove').set('Authorization', 'Bearer valid').send({
                companyId: 'comp-1', userId: 'view-1',
            })).status).toBe(403);
            expect((await request(app).post('/api/v1/team/bulk').set('Authorization', 'Bearer valid').send({
                companyId: 'comp-1', userIds: ['view-1'], action: 'suspend',
            })).status).toBe(403);
        }
    });

    test('owner can invite using verified JWT identity (ignores spoofed invitedBy) and writes audit log', async () => {
        const state = setupMockTables({
            user_profiles: [{ id: 'owner-1', email: 'owner@co.in', full_name: 'Owner' }],
        });
        mockDb.auth.getUser.mockResolvedValue({ data: { user: { id: 'owner-1', email: 'owner@co.in' } }, error: null });

        const res = await request(app)
            .post('/api/v1/team/invite')
            .set('Authorization', 'Bearer valid')
            .send({
                companyId: 'comp-1',
                email: 'NewHire@Co.in',
                role: 'accountant',
                invitedBy: 'spoofed-attacker-id',
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.status).toBe('invited');

        const invWrite = state.writes.find((w) => w.table === 'team_invitations' && w.op === 'insert');
        expect(invWrite).toBeDefined();
        expect(invWrite.payload.invited_by).toBe('owner-1');
        expect(invWrite.payload.email).toBe('newhire@co.in');
        expect(state.activity_logs.some((l) => l.action === 'rbac_user_invited' && l.user_id === 'owner-1')).toBe(true);
    });

    test('owner can update member role, suspend member, and remove member with audit logs', async () => {
        const state = setupMockTables();
        mockDb.auth.getUser.mockResolvedValue({ data: { user: { id: 'owner-1', email: 'owner@co.in' } }, error: null });

        const roleRes = await request(app)
            .put('/api/v1/team/role')
            .set('Authorization', 'Bearer valid')
            .send({ companyId: 'comp-1', userId: 'view-1', role: 'accountant' });
        expect(roleRes.status).toBe(200);

        const statusRes = await request(app)
            .put('/api/v1/team/status')
            .set('Authorization', 'Bearer valid')
            .send({ companyId: 'comp-1', userId: 'acct-1', status: 'suspended' });
        expect(statusRes.status).toBe(200);

        const removeRes = await request(app)
            .delete('/api/v1/team/remove')
            .set('Authorization', 'Bearer valid')
            .send({ companyId: 'comp-1', userId: 'view-1' });
        expect(removeRes.status).toBe(200);

        const actions = state.activity_logs.map((l) => l.action);
        expect(actions).toContain('rbac_role_changed');
        expect(actions).toContain('rbac_user_suspended');
        expect(actions).toContain('rbac_user_removed');
    });

    test('protects company owner from demotion, suspension, and removal even by an admin', async () => {
        setupMockTables({
            company_users: [
                { company_id: 'comp-1', user_id: 'owner-1', role: 'owner', status: 'active' },
                { company_id: 'comp-1', user_id: 'admin-1', role: 'admin', status: 'active' },
            ],
        });
        mockDb.auth.getUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'admin@co.in' } }, error: null });

        expect((await request(app).put('/api/v1/team/role').set('Authorization', 'Bearer valid').send({
            companyId: 'comp-1', userId: 'owner-1', role: 'viewer',
        })).status).toBe(403);

        expect((await request(app).put('/api/v1/team/status').set('Authorization', 'Bearer valid').send({
            companyId: 'comp-1', userId: 'owner-1', status: 'suspended',
        })).status).toBe(403);

        expect((await request(app).delete('/api/v1/team/remove').set('Authorization', 'Bearer valid').send({
            companyId: 'comp-1', userId: 'owner-1',
        })).status).toBe(403);
    });

    test('strictly isolates Company Admin from Super Admin actions, role catalog edits, other companies, and targeting Super Admin', async () => {
        setupMockTables({
            user_profiles: [
                { id: 'admin-1', email: 'cadmin@co.in', is_admin: false },
                { id: 'super-1', email: 'lovneetrathi@gmail.com', is_admin: true },
            ],
            companies: [
                { id: 'comp-1', name: 'Demo Co', owner_id: 'owner-1' },
                { id: 'comp-2', name: 'Other Co', owner_id: 'other-owner' },
            ],
            company_users: [
                { company_id: 'comp-1', user_id: 'owner-1', role: 'owner', status: 'active' },
                { company_id: 'comp-1', user_id: 'admin-1', role: 'admin', status: 'active' },
                { company_id: 'comp-1', user_id: 'super-1', role: 'super_admin', status: 'active' },
                { company_id: 'comp-1', user_id: 'view-1', role: 'viewer', status: 'active' },
            ],
        });
        mockDb.auth.getUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'cadmin@co.in' } }, error: null });

        // Blocked from global role CRUD (Super Admin only)
        expect((await request(app).post('/api/v1/team/roles').set('Authorization', 'Bearer valid').send({
            displayName: 'Rogue Role', permissions: {},
        })).status).toBe(403);
        expect((await request(app).put('/api/v1/team/roles/r-1').set('Authorization', 'Bearer valid').send({
            displayName: 'Hacked',
        })).status).toBe(403);
        expect((await request(app).delete('/api/v1/team/roles/r-1').set('Authorization', 'Bearer valid')).status).toBe(403);

        // Blocked from assigning super_admin or owner
        expect((await request(app).post('/api/v1/team/invite').set('Authorization', 'Bearer valid').send({
            companyId: 'comp-1', email: 'friend@co.in', role: 'super_admin',
        })).status).toBe(403);
        expect((await request(app).put('/api/v1/team/role').set('Authorization', 'Bearer valid').send({
            companyId: 'comp-1', userId: 'view-1', role: 'owner',
        })).status).toBe(403);

        // Blocked from accessing or mutating another company
        expect((await request(app).get('/api/v1/team/comp-2').set('Authorization', 'Bearer valid')).status).toBe(403);
        expect((await request(app).post('/api/v1/team/invite').set('Authorization', 'Bearer valid').send({
            companyId: 'comp-2', email: 'friend@co.in', role: 'viewer',
        })).status).toBe(403);

        // Blocked from demoting, suspending, or removing Platform Super Admin
        expect((await request(app).put('/api/v1/team/role').set('Authorization', 'Bearer valid').send({
            companyId: 'comp-1', userId: 'super-1', role: 'viewer',
        })).status).toBe(403);
        expect((await request(app).put('/api/v1/team/status').set('Authorization', 'Bearer valid').send({
            companyId: 'comp-1', userId: 'super-1', status: 'suspended',
        })).status).toBe(403);
        expect((await request(app).delete('/api/v1/team/remove').set('Authorization', 'Bearer valid').send({
            companyId: 'comp-1', userId: 'super-1',
        })).status).toBe(403);
    });

    test('Platform Super Admin can manage global roles across any company', async () => {
        setupMockTables({
            user_profiles: [{ id: 'super-1', email: 'lovneetrathi@gmail.com', is_admin: true }],
        });
        mockDb.auth.getUser.mockResolvedValue({ data: { user: { id: 'super-1', email: 'lovneetrathi@gmail.com' } }, error: null });

        const createRoleRes = await request(app)
            .post('/api/v1/team/roles')
            .set('Authorization', 'Bearer valid')
            .send({ displayName: 'Tax Auditor', permissions: { Reports: { View: true, Export: true } } });
        expect(createRoleRes.status).toBe(201);
        expect(createRoleRes.body.success).toBe(true);
    });

    test('invite & resend report honest email delivery status and do not fake resend success when mailer fails', async () => {
        const invId = '11111111-1111-4111-8111-111111111111';
        const state = setupMockTables({
            user_profiles: [{ id: 'owner-1', email: 'owner@co.in', full_name: 'Owner' }],
            team_invitations: [
                {
                    id: invId,
                    company_id: 'comp-1',
                    email: 'pending@co.in',
                    full_name: 'Pending User',
                    role: 'viewer',
                    status: 'pending',
                },
            ],
        });
        mockDb.auth.getUser.mockResolvedValue({ data: { user: { id: 'owner-1', email: 'owner@co.in' } }, error: null });

        // 1. Invite fails email delivery -> emailSent: false, honest message
        mockDb.auth.admin.inviteUserByEmail.mockResolvedValueOnce({ data: null, error: new Error('SMTP disabled') });
        const invFailRes = await request(app)
            .post('/api/v1/team/invite')
            .set('Authorization', 'Bearer valid')
            .send({ companyId: 'comp-1', email: 'nomail@co.in', role: 'viewer' });
        expect(invFailRes.status).toBe(200);
        expect(invFailRes.body.status).toBe('invited');
        expect(invFailRes.body.emailSent).toBe(false);
        expect(invFailRes.body.emailError).toContain('SMTP disabled');

        // 2. Invite succeeds email delivery -> emailSent: true
        mockDb.auth.admin.inviteUserByEmail.mockResolvedValueOnce({ data: { user: { id: 'inv-u1' } }, error: null });
        const invOkRes = await request(app)
            .post('/api/v1/team/invite')
            .set('Authorization', 'Bearer valid')
            .send({ companyId: 'comp-1', email: 'okmail@co.in', role: 'viewer' });
        expect(invOkRes.status).toBe(200);
        expect(invOkRes.body.status).toBe('invited');
        expect(invOkRes.body.emailSent).toBe(true);

        // 3. Resend fails when mailer fails -> 502, does NOT update resent_at
        mockDb.auth.admin.inviteUserByEmail.mockResolvedValueOnce({ data: null, error: new Error('Rate limited') });
        const resendFailRes = await request(app)
            .post(`/api/v1/team/invitations/${invId}/resend`)
            .set('Authorization', 'Bearer valid')
            .send({});
        expect(resendFailRes.status).toBe(502);
        expect(resendFailRes.body.emailSent).toBe(false);
        expect(state.writes.some((w) => w.table === 'team_invitations' && w.op === 'update')).toBe(false);

        // 4. Resend succeeds when mailer succeeds -> 200 and updates resent_at
        mockDb.auth.admin.inviteUserByEmail.mockResolvedValueOnce({ data: { user: { id: 'inv-u2' } }, error: null });
        const resendOkRes = await request(app)
            .post(`/api/v1/team/invitations/${invId}/resend`)
            .set('Authorization', 'Bearer valid')
            .send({});
        expect(resendOkRes.status).toBe(200);
        expect(resendOkRes.body.emailSent).toBe(true);
        expect(state.writes.some((w) => w.table === 'team_invitations' && w.op === 'update')).toBe(true);
    });
});
