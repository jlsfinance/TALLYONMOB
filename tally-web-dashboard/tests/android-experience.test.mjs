import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';

async function initialize(platform, dev, search = '', savedPreview = null) {
    const listeners = [];
    const root = { dataset: {} };
    let stored = savedPreview;
    const bundle = await build({ entryPoints: ['src/lib/androidExperience.ts'], bundle: true, write: false,
        platform: 'node', format: 'cjs', define: { 'import.meta.env.DEV': String(dev) },
        plugins: [{ name: 'capacitor-platform', setup(b) {
            b.onResolve({ filter: /^@capacitor\// }, args => ({ path: args.path, namespace: 'fixture' }));
            b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const Capacitor={getPlatform:()=>${JSON.stringify(platform)}}; export const Haptics={impact:async()=>{}};export const ImpactStyle={Light:'LIGHT'};` }));
        } }],
    });
    const sandbox = { module: { exports: {} }, URLSearchParams,
        document: { documentElement: root, addEventListener: (...args) => listeners.push(args) },
        window: { location: { search }, sessionStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } } },
    };
    vm.runInNewContext(bundle.outputFiles[0].text, sandbox);
    sandbox.module.exports.initializeAndroidExperience();
    return { root, listeners, stored };
}
test('real Android enables the theme and native touch feedback', async () => {
    const result = await initialize('android', false);
    assert.equal(result.root.dataset.platform, 'android');
    assert.equal(result.listeners[0][0], 'pointerup');
});
test('production web cannot enable the Android preview using a URL or storage', async () => {
    const result = await initialize('web', false, '?native-preview=android', 'true');
    assert.equal(result.root.dataset.platform, undefined);
    assert.equal(result.listeners.length, 0);
});
test('local preview enables visual styling without calling native haptics', async () => {
    const result = await initialize('web', true, '?native-preview=android');
    assert.equal(result.root.dataset.platform, 'android');
    assert.equal(result.stored, 'true');
    assert.equal(result.listeners.length, 0);
});
test('iOS remains outside the Android redesign', async () => {
    assert.equal((await initialize('ios', false)).root.dataset.platform, undefined);
});
