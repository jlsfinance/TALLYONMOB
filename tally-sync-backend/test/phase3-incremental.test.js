const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const engine = fs.readFileSync(path.join(root, 'tally-web-dashboard/src/lib/incrementalSync.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'tally-web-dashboard/supabase/migrations/20261010_phase3_incremental_cursor.sql'), 'utf8');
const backend = fs.readFileSync(path.join(__dirname, '..', 'src/index.js'), 'utf8');

test('Phase 3 resumes from a persisted Alter ID cursor instead of an unstable offset', () => {
  assert.match(engine, /last_processed_alter_id/);
  assert.match(engine, /checkpoint\?\.last_processed_alter_id \?\? state\.last_alter_id/);
  assert.match(engine, /\.gt\('alter_id', lastAlterId\)/);
  assert.match(engine, /Non-advancing Alter ID cursor/);
  assert.doesNotMatch(engine, /\.range\(offset, offset \+ limit - 1\)/);
});

test('Phase 3 migration adds the resumable cursor and active checkpoint index', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS last_processed_alter_id INTEGER/);
  assert.match(migration, /idx_sync_checkpoint_company_module_active/);
});

test('Phase 3 enables response compression without changing sync routes', () => {
  assert.match(backend, /require\('compression'\)/);
  assert.match(backend, /app\.use\(compression\(\{ threshold: (1024|'1kb') \}\)\)/);
});
