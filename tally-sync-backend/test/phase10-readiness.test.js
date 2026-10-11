const test = require('node:test');
const assert = require('node:assert/strict');
const { checkTable, withTimeout } = require('../src/services/readinessService');

function fakeClient(result) {
  return {
    from(table) {
      assert.equal(table, 'companies');
      return {
        select(columns, options) {
          assert.equal(columns, 'id');
          assert.deepEqual(options, { head: true, count: 'exact' });
          return {
            limit(value) {
              assert.equal(value, 1);
              return Promise.resolve(result);
            },
          };
        },
      };
    },
  };
}

test('readiness check reports healthy when the dependency query succeeds', async () => {
  assert.equal(await checkTable(fakeClient({ error: null }), 'companies'), 'healthy');
});

test('readiness check fails closed when the dependency query returns an error', async () => {
  assert.equal(await checkTable(fakeClient({ error: new Error('database unavailable') }), 'companies'), 'unhealthy');
});

test('readiness check reports not_configured without credentials', async () => {
  assert.equal(await checkTable(null, 'companies'), 'not_configured');
});

test('readiness timeout rejects slow dependency checks', async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 5),
    /readiness check timeout/,
  );
});
