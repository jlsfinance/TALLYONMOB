import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server.js';

let fixture;
const bundle = await build({
    entryPoints: ['src/pages/SubscriptionPage.tsx'], bundle: true, platform: 'node',
    format: 'cjs', write: false, jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-router-dom', 'lucide-react'],
    loader: { '.css': 'empty' }, define: { 'import.meta.env.VITE_SUBSCRIPTION_API_URL': '""' },
    plugins: [{ name: 'subscription-preview-state', setup(builder) {
        builder.onResolve({ filter: /^@\/(contexts|hooks|lib)\// }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onResolve({ filter: /^@tanstack\/react-query$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
            export const useAuth = () => globalThis.fixture().auth;
            export const useLicenseGate = () => ({...globalThis.fixture().gate, refresh: async () => {}});
            export const useSubscriptionCatalog = () => ({data: globalThis.fixture().plans});
            export const useQuery = () => ({data:{enabled:true},refetch() {}});
            export const supabase = {};
        ` }));
    } }],
});
const sandbox = { module: { exports: {} }, require: createRequire(import.meta.url), fixture: () => fixture, window: { localStorage: { getItem: () => null } } };
vm.runInNewContext(bundle.outputFiles[0].text, sandbox);
const Page = sandbox.module.exports.default;
function render(status = 'active', signedIn = true) {
    fixture = {
        auth: { user: signedIn ? { id: 'preview-user' } : null, loading: false },
        gate: { isLoading: false, licenseError: null, license: { status, planName: 'Monthly', planSlug: 'monthly', expiryDate: '2026-12-09T12:00:00Z', daysLeft: 30 } },
        plans: [
            { id: 'monthly', title: 'Monthly', price: 159, period: '1 month', badge: '', features: ['Unlimited Vouchers', 'GST Reports', 'WhatsApp Invoicing', 'Priority Support'] },
            { id: 'half_yearly', title: '6 Months', price: 599, period: '6 months', badge: 'Popular', features: ['Unlimited Vouchers', 'Advanced Reports', 'WhatsApp Invoicing', 'Priority Support'] },
            { id: 'yearly', title: 'Yearly', price: 999, period: '1 year', badge: 'Best value', features: ['Unlimited Vouchers', 'Advanced Reports', 'WhatsApp Invoicing', 'Priority Support'] },
        ],
    };
    return renderToStaticMarkup(React.createElement(StaticRouter, { location: '/subscription' }, React.createElement(Page)));
}
test('current plan is shown above the plan carousel with expiry and remaining days', () => {
    const html = render();
    assert.ok(html.indexOf('My subscription') < html.indexOf('Renew or upgrade'));
    assert.match(html, /30 days left/);
    assert.match(html, /Your current plan/);
    assert.match(html, /Show Yearly/);
});
test('signed-out users are asked to sign in rather than told their plan is missing', () => {
    const html = render('none', false);
    assert.match(html, /Sign in to view your plan/);
    assert.doesNotMatch(html, /No active plan/);
});
test('an authenticated account without a licence sees no active plan', () => {
    assert.match(render('none'), /No active plan/);
});

if (process.env.SUBSCRIPTION_VISUAL_DIR) {
    const css = readFileSync('src/pages/SubscriptionPage.css', 'utf8');
    for (const theme of ['light', 'dark']) {
        const html = `<!doctype html><html class="${theme === 'dark' ? 'dark' : ''}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}button,input{font:inherit}a{color:inherit;text-decoration:none}button{color:inherit}${css}</style></head><body>${render()}</body></html>`;
        writeFileSync(resolve(process.env.SUBSCRIPTION_VISUAL_DIR, `subscription-${theme}.html`), html);
    }
}
