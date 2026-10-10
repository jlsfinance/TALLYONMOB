const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const api = read('tally-windows-sync/Services/ApiClient.cs');
const connector = read('tally-windows-sync/Services/TallyConnector.cs');
const model = read('tally-windows-sync/Models/TallyModels.cs');
const portal = read('tally-sync-backend/src/routes/portal.js');
const migration = read('tally-sync-backend/supabase/migrations/20261010_phase12_complete_stock_source_fields.sql');

test('Phase 10 retry path is bounded, authenticated, and surfaces unrecovered rows', () => {
  assert.match(api, /MaxRowsPerRequest\s*=\s*100/);
  assert.match(api, /var fallbackSize = rows\.Count > 50 \? 50 : 25/);
  assert.match(api, /if \(rows\.Count <= 25\)[\s\S]*?UpsertRowsIndividuallyAsync/);
  const rowFallback = api.slice(api.indexOf('private async Task<ApiResponse<object>> UpsertRowsIndividuallyAsync'), api.indexOf('private static ApiResponse<SyncResultDetails>'));
  assert.ok(rowFallback.includes('AddAuthHeader();'), 'row-by-row retry must attach auth');
  assert.match(rowFallback, /row\.DeepClone\(\)[\s\S]*?JTokenType\.Null/);
  assert.match(rowFallback, /\[QUARANTINE\].*row.*failed after single-row retry/);
  assert.match(api, /failed after 100→50→25→row fallback/);
});

test('Phase 12 has only additive schema changes and keeps stock_items canonical', () => {
  assert.match(migration, /ALTER TABLE IF EXISTS public\.stock_items/i);
  assert.match(migration, /ALTER TABLE IF EXISTS public\.voucher_stock_entries/i);
  assert.doesNotMatch(migration, /^\s*(?:DROP\b|DELETE\b|TRUNCATE\b|UPDATE\b|INSERT\s+INTO\b)/im);
  for (const field of ['alias', 'stock_category', 'additional_unit', 'alternate_units', 'gst_applicable', 'taxability', 'gst_details', 'raw_data']) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${field}\\b`, 'i'));
  }
  for (const field of ['godown_name', 'batch_name', 'cost_centre', 'cgst_amount', 'sgst_amount', 'igst_amount', 'cess_amount']) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${field}\\b`, 'i'));
  }
  assert.match(portal, /\.from\('stock_items'\)/);
  assert.doesNotMatch(portal, /\.from\('tally_stock'\)/);
});

test('Phase 12 source fields are extracted, modelled, and included in child-row upserts', () => {
  for (const field of ['ALIAS', 'CATEGORY', 'ADDITIONALUNITS', 'CONVERSION', 'GSTAPPLICABLE']) assert.ok(connector.includes(field));
  for (const field of ['GodownName', 'BatchName', 'CostCentre', 'CgstAmount', 'SgstAmount', 'IgstAmount', 'CessAmount']) {
    assert.ok(connector.includes(`${field} =`), `missing XML mapper for ${field}`);
    assert.ok(model.includes(`public ${field === 'GodownName' || field === 'BatchName' || field === 'CostCentre' ? 'string?' : 'decimal?'} ${field}`), `missing model property ${field}`);
    assert.ok(api.includes(`entry.${field}`), `missing child-row upsert field ${field}`);
  }
  assert.match(connector, /\["source"\]\s*=\s*"Tally XML"/);
  assert.doesNotMatch(connector, /ToString\(SaveOptions\.DisableFormatting\).*RawData|RawData[\s\S]{0,120}ToString\(SaveOptions\.DisableFormatting\)/);
});
