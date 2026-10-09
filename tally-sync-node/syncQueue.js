const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SyncQueue {
  constructor(filePath = path.join(__dirname, 'sync-queue.json'), options = {}) {
    this.filePath = filePath;
    this.maxAttempts = options.maxAttempts ?? 8;
    this.baseDelayMs = options.baseDelayMs ?? 5000;
    this.maxDelayMs = options.maxDelayMs ?? 15 * 60 * 1000;
    this.items = this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error(`[queue] Could not load queue: ${error.message}`);
      return [];
    }
  }

  persist() {
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(this.items, null, 2), 'utf8');
    fs.renameSync(tempPath, this.filePath);
  }

  enqueue(payload, key = null) {
    const dedupeKey = key || crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const existing = this.items.find((item) => item.dedupeKey === dedupeKey);
    if (existing) return existing;

    const item = {
      id: crypto.randomUUID(),
      dedupeKey,
      payload,
      attempts: 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
      nextAttemptAt: new Date().toISOString(),
      lastError: null,
    };
    this.items.push(item);
    this.persist();
    return item;
  }

  due(now = Date.now()) {
    return this.items.filter((item) =>
      item.status === 'pending' && new Date(item.nextAttemptAt).getTime() <= now
    );
  }

  markSuccess(itemId) {
    const item = this.items.find((entry) => entry.id === itemId);
    if (!item) return;
    item.status = 'completed';
    item.completedAt = new Date().toISOString();
    item.lastError = null;
    this.persist();
  }

  markFailure(itemId, error) {
    const item = this.items.find((entry) => entry.id === itemId);
    if (!item) return;
    item.attempts += 1;
    item.lastError = error?.message || String(error);
    if (item.attempts >= this.maxAttempts) {
      item.status = 'failed';
    } else {
      const delay = Math.min(this.baseDelayMs * (2 ** (item.attempts - 1)), this.maxDelayMs);
      item.nextAttemptAt = new Date(Date.now() + delay).toISOString();
      item.status = 'pending';
    }
    this.persist();
  }

  pendingCount() {
    return this.items.filter((item) => item.status === 'pending').length;
  }

  failedCount() {
    return this.items.filter((item) => item.status === 'failed').length;
  }

  compact() {
    // Keep a bounded completed-key history so the next scheduled cycle does not
    // upload an unchanged full batch again. Failed/pending items are never pruned.
    const completed = this.items.filter((item) => item.status === 'completed').slice(-1000);
    const active = this.items.filter((item) => item.status !== 'completed');
    this.items = [...active, ...completed];
    this.persist();
  }
}

module.exports = { SyncQueue };
