import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { planBatch } from '../scripts/seo-automation.mjs';
import { digest } from '../scripts/seo-content.mjs';
import { searchPages } from '../src/config/searchPages.mjs';

const briefs = JSON.parse(readFileSync(new URL('../content/seo/briefs.json', import.meta.url), 'utf8'));
const early = new Date('2026-11-01T03:23:00Z');
const late = new Date('2026-11-16T03:23:00Z');

test('the 15-article limit splits 7 and 8, with unused capacity carried into the second batch', () => {
    const first = planBatch(briefs, new Map(), 15, early);
    assert.equal(first.fresh.length, 7);
    const published = new Map(first.fresh.map(({ brief, revision }) =>
        [brief.slug, { automation: { publishedMonth: first.month, revision } }]));
    assert.deepEqual(planBatch(briefs, published, 15, early).fresh, []);
    assert.equal(planBatch(briefs, published, 15, late).fresh.length, 8);
    assert.equal(planBatch(briefs, new Map(), 15, late).fresh.length, 15);
});

test('the 30 and 50 targets split into equal batches without expanding verified briefs in plan mode', () => {
    assert.equal(planBatch(briefs, new Map(), 30, early).capacity, 15);
    assert.equal(planBatch(briefs, new Map(), 50, early).capacity, 25);
    assert.equal(planBatch(briefs, new Map(), 50, early).fresh.length, 15);
    assert.throws(() => planBatch(briefs, new Map(), 60, late), /15, 30 or 50/);
});

test('changed briefs refresh their existing slug and manual snapshots are preserved', () => {
    const [automatic, manual] = briefs;
    const records = new Map([
        [automatic.slug, { automation: { revision: digest(JSON.stringify([automatic, searchPages[automatic.relatedPath]])), publishedMonth: '2026-10' } }],
        [manual.slug, {}],
    ]);
    const changed = [{ ...automatic, facts: 'Changed verified evidence.' }, { ...manual, facts: 'Updated manual draft.' }];
    const plan = planBatch(changed, records, 15, late);
    assert.deepEqual(plan.fresh, []);
    assert.deepEqual(plan.updates.map(candidate => candidate.brief.slug), [automatic.slug]);
    assert.throws(() => planBatch([automatic, automatic], records, 15, late), /duplicate SEO brief/);
});

test('the cutoff follows India days across UTC midnight', () => {
    const atCutoff = new Date('2026-11-15T18:30:00Z');
    const beforeCutoff = new Date(atCutoff.getTime() - 1);
    assert.equal(planBatch(briefs, new Map(), 15, beforeCutoff).capacity, 7);
    assert.equal(planBatch(briefs, new Map(), 15, atCutoff).capacity, 15);
});
