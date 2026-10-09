const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SyncQueue } = require('../syncQueue');

function tempQueue() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tally-sync-')), 'queue.json');
}

test('deduplicates pending payloads and persists them', () => {
  const file = tempQueue();
  const queue = new SyncQueue(file, { baseDelayMs: 10 });
  const first = queue.enqueue({ dataType: 'ledgers', data: [{ id: '1' }] }, 'same-key');
  const second = queue.enqueue({ dataType: 'ledgers', data: [{ id: '1' }] }, 'same-key');
  assert.equal(first.id, second.id);
  assert.equal(queue.pendingCount(), 1);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).length, 1);
});

test('retries with exponential backoff and eventually marks permanent failure', () => {
  const file = tempQueue();
  const queue = new SyncQueue(file, { baseDelayMs: 100, maxAttempts: 3 });
  const item = queue.enqueue({ dataType: 'ledgers', data: [] });
  queue.markFailure(item.id, new Error('network down'));
  const afterFirst = queue.items.find((entry) => entry.id === item.id);
  assert.equal(afterFirst.attempts, 1);
  assert.equal(afterFirst.status, 'pending');
  assert.ok(new Date(afterFirst.nextAttemptAt).getTime() >= Date.now());
  queue.markFailure(item.id, new Error('network down'));
  queue.markFailure(item.id, new Error('network down'));
  const failed = queue.items.find((entry) => entry.id === item.id);
  assert.equal(failed.attempts, 3);
  assert.equal(failed.status, 'failed');
});

test('completed records are compacted after successful delivery', () => {
  const file = tempQueue();
  const queue = new SyncQueue(file);
  const item = queue.enqueue({ dataType: 'ledgers', data: [] });
  queue.markSuccess(item.id);
  assert.equal(queue.items.length, 1);
  queue.compact();
  assert.equal(queue.items.length, 1);
  assert.equal(queue.enqueue({ dataType: 'ledgers', data: [] }, item.dedupeKey).id, item.id);
});
