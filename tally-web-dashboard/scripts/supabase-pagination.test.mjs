import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllSupabaseRows } from '../src/lib/supabasePagination.js';

function cappedQuery(rows, serverCap, calls) {
  return async (from, to) => {
    calls.push({ from, to });
    return { data: rows.slice(from, Math.min(to + 1, from + serverCap)), error: null };
  };
}

test('fetches all records beyond 1,000 in bounded ranges', async () => {
  const rows = Array.from({ length: 2507 }, (_, index) => ({ id: `row-${index}`, value: index }));
  const calls = [];
  const result = await fetchAllSupabaseRows(cappedQuery(rows, 1000, calls));

  assert.equal(result.length, rows.length);
  assert.equal(result[1000].id, 'row-1000');
  assert.equal(result.at(-1).id, 'row-2506');
  assert.deepEqual(calls.map(({ from }) => from), [0, 1000, 2000, 2507]);
  assert.ok(calls.every(({ to, from }) => to - from + 1 === 1000));
});

test('includes later-page bills in report counts and financial totals', async () => {
  const rows = Array.from({ length: 2507 }, (_, index) => ({
    id: `voucher-${index}`,
    voucher_type: index % 2 === 0 ? 'Sales' : 'Purchase',
    amount: index + 1,
  }));
  const result = await fetchAllSupabaseRows(cappedQuery(rows, 300, []));
  const expectedSales = rows.filter((row) => row.voucher_type === 'Sales');
  const actualSales = result.filter((row) => row.voucher_type === 'Sales');

  assert.equal(result.length, rows.length);
  assert.equal(actualSales.length, expectedSales.length);
  assert.equal(actualSales.reduce((sum, row) => sum + row.amount, 0), expectedSales.reduce((sum, row) => sum + row.amount, 0));
  assert.equal(result.at(-1).id, 'voucher-2506');
});

test('advances by actual returned rows when server max_rows is below requested page size', async () => {
  const rows = Array.from({ length: 2303 }, (_, index) => ({ id: index + 1 }));
  const calls = [];
  const result = await fetchAllSupabaseRows(cappedQuery(rows, 137, calls), { pageSize: 1000 });

  assert.equal(result.length, rows.length);
  assert.equal(result.at(-1).id, 2303);
  assert.deepEqual(calls.slice(0, 3).map(({ from }) => from), [0, 137, 274]);
  assert.equal(calls.at(-1).from, 2303);
});

test('fills a bounded batch across smaller server-capped responses', async () => {
  const rows = Array.from({ length: 2303 }, (_, index) => ({ id: index + 1 }));
  const calls = [];
  const result = await fetchAllSupabaseRows(cappedQuery(rows, 137, calls), { pageSize: 1000, maxRows: 500 });

  assert.equal(result.length, 500);
  assert.equal(result.at(-1).id, 500);
  assert.deepEqual(calls.map(({ from }) => from), [0, 137, 274, 411]);
  assert.equal(calls.at(-1).to, 499);
});

test('deduplicates overlapping rows without losing distinct IDs', async () => {
  const pages = [
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    [{ id: 'c' }, { id: 'd' }],
    [],
  ];
  const calls = [];
  const result = await fetchAllSupabaseRows(async () => ({ data: pages[calls.length++] || [], error: null }), { pageSize: 3 });

  assert.deepEqual(result.map((row) => row.id), ['a', 'b', 'c', 'd']);
  assert.equal(calls.length, 3);
});

test('stops only on an empty batch, including an exactly full final batch', async () => {
  const pages = [[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }, { id: 'd' }], []];
  let call = 0;
  const result = await fetchAllSupabaseRows(async () => ({ data: pages[call++] || [], error: null }), { pageSize: 2 });

  assert.deepEqual(result.map((row) => row.id), ['a', 'b', 'c', 'd']);
  assert.equal(call, 3);
});

test('throws database errors instead of returning partial rows', async () => {
  const failure = new Error('permission denied');
  let call = 0;
  await assert.rejects(
    fetchAllSupabaseRows(async () => {
      call += 1;
      if (call === 1) return { data: [{ id: 'ok' }], error: null };
      return { data: null, error: failure };
    }),
    failure,
  );
});

test('rejects a repeated non-empty page that cannot make pagination progress', async () => {
  const repeated = [{ id: 'same' }, { id: 'same' }];
  await assert.rejects(
    fetchAllSupabaseRows(async () => ({ data: repeated, error: null }), { pageSize: 2 }),
    /made no progress/,
  );
});
