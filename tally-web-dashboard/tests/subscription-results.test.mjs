import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server.js';

// Render the real page with controlled auth/query results, without charging or
// connecting to production. Callback parameters cannot substitute for API data.
let fixture;
const bundle = await build({
    entryPoints: ['src/pages/SubscriptionPaymentResultPage.tsx'], bundle: true,
    platform: 'node', format: 'cjs', write: false, jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-router-dom', 'lucide-react'],
    loader: { '.css': 'empty' },
    plugins: [{ name: 'controlled-payment-state', setup(builder) {
        builder.onResolve({ filter: /^@\/(contexts|lib)\// }, args => ({ path: args.path, namespace: 'stub' }));
        builder.onResolve({ filter: /^@tanstack\/react-query$/ }, args => ({ path: args.path, namespace: 'stub' }));
        builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: `
            export const useAuth = () => globalThis.fixture().auth;
            export const useLicenseGate = () => ({ refresh: async () => {} });
            export const useQuery = () => globalThis.fixture().query;
            export const supabase = {};
        ` }));
    } }],
});
const sandbox = { module: { exports: {} }, require: createRequire(import.meta.url), fixture: () => fixture };
vm.runInNewContext(bundle.outputFiles[0].text, sandbox);
const Page = sandbox.module.exports.default;
const order = '11111111-1111-4111-8111-111111111111';
function render(status, query = '') {
    fixture = { auth: { user: { id: 'user-a' }, loading: false }, query: { data: status ? { status, orderId: order } : undefined, isError: false, isFetching: false, refetch() {} } };
    return renderToStaticMarkup(React.createElement(StaticRouter, { location: `/subscription/payment-result?checkout=${order}${query}` }, React.createElement(Page)));
}
test('paid server result shows success and dashboard action', () => {
    const html = render('paid');
    assert.match(html, /Payment successful!/);
    assert.match(html, /Continue to dashboard/);
});
for (const [status, title] of [['failed', 'Payment failed'], ['expired', 'Payment link expired'], ['cancelled', 'Payment cancelled']]) {
    test(`${status} shows its result and retry route`, () => {
        const html = render(status);
        assert.match(html, new RegExp(title));
        assert.match(html, /Choose a plan/);
        assert.doesNotMatch(html, /Payment successful!/);
    });
}
test('forged success URL never overrides pending server status', () => {
    const html = render('pending', '&status=paid&razorpay_payment_link_status=paid');
    assert.match(html, /Payment confirmation pending/);
    assert.doesNotMatch(html, /Payment successful!/);
});
test('network error is not reported as a failed payment', () => {
    render(); fixture.query.isError = true; fixture.query.error = new Error('Connection unavailable');
    const html = renderToStaticMarkup(React.createElement(StaticRouter, { location: `/?checkout=${order}` }, React.createElement(Page)));
    assert.match(html, /Unable to confirm payment/);
    assert.doesNotMatch(html, />Payment failed</);
});
test('missing reference is not shown as a payment success', () => {
    render();
    const html = renderToStaticMarkup(React.createElement(StaticRouter, {location: "/"}, React.createElement(Page)));
    assert.match(html, /Payment reference missing/);
    assert.doesNotMatch(html, /Payment successful!/);
});
