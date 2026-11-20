import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { searchPages } from '../src/config/searchPages.mjs';
import { digest, readArticle, slugPattern, writeApprovedArticle } from './seo-content.mjs';

const directory = 'content/seo';
const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const monthAndDay = date => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const part = type => parts.find(value => value.type === type).value;
    return { month: part('year') + '-' + part('month'), secondBatch: Number(part('day')) >= 16 };
};

export function planBatch(briefs, records, monthlyTarget, date) {
    if (![15, 30, 50].includes(monthlyTarget)) throw new Error('SEO_MONTHLY_ARTICLES must be 15, 30 or 50.');
    const { month, secondBatch } = monthAndDay(date);
    const limit = secondBatch ? monthlyTarget : Math.floor(monthlyTarget / 2);
    const published = [...records.values()].filter(value => value.automation?.publishedMonth === month).length;
    const fresh = [];
    const updates = [];
    const seen = new Set();
    for (const brief of briefs) {
        if (!slugPattern.test(brief?.slug ?? '') || seen.has(brief.slug)
            || !Object.hasOwn(searchPages, brief.relatedPath)
            || typeof brief.topic !== 'string' || !brief.topic.trim()
            || typeof brief.facts !== 'string' || !brief.facts.trim()) {
            throw new Error('Invalid or duplicate SEO brief: ' + brief?.slug);
        }
        seen.add(brief.slug);
        const revision = digest(JSON.stringify([brief, searchPages[brief.relatedPath]]));
        const existing = records.get(brief.slug);
        if (!existing) fresh.push({ brief, revision });
        else if (existing.automation && existing.automation.revision !== revision) updates.push({ brief, revision, existing });
    }
    const capacity = Math.max(0, limit - published);
    return { month, capacity, fresh: fresh.slice(0, capacity), updates: updates.slice(0, Math.ceil(monthlyTarget / 2)) };
}

async function loadRecords() {
    const approved = resolve(directory, 'approved');
    const files = await readdir(approved).catch(error => {
        if (error.code === 'ENOENT') return [];
        throw error;
    });
    const results = await Promise.all(files.filter(file => file.endsWith('.json')).map(async file => {
        const slug = file.slice(0, -5);
        const record = JSON.parse(await readFile(resolve(approved, file), 'utf8'));
        if (typeof record.content !== 'string' || digest(record.content) !== record.sha256) {
            throw new Error('Invalid approved snapshot: ' + file);
        }
        return [slug, { ...record, article: readArticle(record.content, slug) }];
    }));
    return new Map(results);
}

function validateCandidate(article, slug, records, existing) {
    const content = JSON.stringify(article, null, 2) + '\n';
    readArticle(content, slug);
    const headingSet = new Set(article.sections.map(section => normalize(section.heading)));
    if (headingSet.size !== article.sections.length || article.sections.length < 3) {
        throw new Error('Write at least three distinct sections.');
    }
    const body = value => value.sections.map(section => normalize(section.body)).join(' ');
    if ([...records.entries()].some(([otherSlug, other]) => otherSlug !== slug
        && (normalize(other.article.title) === normalize(article.title) || body(other.article) === body(article)))) {
        throw new Error('The generated article duplicates a published page.');
    }
    return !existing || body(existing.article) !== body(article) ? content : null;
}

async function draftArticle(candidate, callGemini) {
    const { brief, existing } = candidate;
    const context = { brief, page: searchPages[brief.relatedPath], previousArticle: existing?.article };
    const answer = await callGemini({
        systemPrompt: 'Write a genuinely useful Syncora help article in English for a TallyPrime user. Return only JSON with slug, title (max 90 characters), description (max 170), sections (at least 3 objects with heading and body), and relatedPaths (use only the one supplied URL path). Include concrete checks or a clearly labeled illustrative example. Use only supplied product facts. Do not invent UI labels, pricing, claims, legal or tax advice, testimonials, rates or external URLs. For updates keep the same slug and revise only where the brief supports a substantive correction.',
        userPrompt: JSON.stringify(context),
        expectJson: true,
    });
    if (!answer.ok || answer.json?.relatedPaths?.length !== 1 || answer.json.relatedPaths[0] !== brief.relatedPath) {
        throw new Error('Generator did not return the requested article format.');
    }
    return answer.json;
}

async function reviewArticle(candidate, article, callGemini) {
    const result = await callGemini({
        systemPrompt: 'Review this proposed Syncora help article before publication. Return only JSON {"approved":true} only when it answers its distinct question with practical, specific steps, all product claims are grounded in its brief and page summary, it contains no invented prices, UI labels, guarantees, reviews, or legal or tax advice, and any change to an existing article is substantive. Otherwise return {"approved":false}.',
        userPrompt: JSON.stringify({ ...candidate.brief, page: searchPages[candidate.brief.relatedPath], article }),
        expectJson: true,
    });
    return result.ok && result.json?.approved === true;
}


async function suggestBriefs(known, records, slots, callGemini) {
    const knownSlugs = new Set([...known.map(item => item.slug), ...records.keys()]);
    const knownTitles = new Set([...known.map(item => normalize(item.topic)),
        ...[...records.values()].map(record => normalize(record.article.title))]);
    const guidePaths = ['/guides/tallyprime-setup', '/guides/tally-ledger-on-mobile',
        '/guides/tally-sync-troubleshooting', '/product-overview', '/for-accountants'];
    const answer = await callGemini({
        systemPrompt: 'Suggest genuinely distinct customer questions that can support useful Syncora help articles. Return JSON {"briefs":[{"slug":"lowercase-kebab-case","topic":"reader question","relatedPath":"/supplied-path","facts":"a verified detail quoted from the supplied guides or examples"}]}. Do not rephrase existing topics, invent product features or add finance, tax or pricing advice. Return fewer items or an empty list if the verified material does not support more useful topics.',
        userPrompt: JSON.stringify({
            slots, existingTopics: [...knownTitles],
            guides: Object.fromEntries(guidePaths.map(path => [path, searchPages[path]])),
            verifiedExamples: known.map(({ relatedPath, facts }) => ({ relatedPath, facts })),
        }),
        expectJson: true,
    });
    if (!answer.ok || !Array.isArray(answer.json?.briefs)) throw new Error('Topic research returned an invalid response.');
    const proposals = [];
    for (const item of answer.json.briefs) {
        if (proposals.length >= slots) break;
        if (!item || !slugPattern.test(item.slug ?? '') || knownSlugs.has(item.slug) || !guidePaths.includes(item.relatedPath)
            || typeof item.topic !== 'string' || item.topic.length > 120 || !normalize(item.topic)
            || typeof item.facts !== 'string' || item.facts.length > 240 || knownTitles.has(normalize(item.topic))) continue;
        const facts = [...searchPages[item.relatedPath], ...known.filter(brief => brief.relatedPath === item.relatedPath).map(brief => brief.facts)];
        if (!normalize(item.facts) || !facts.some(fact => normalize(fact).includes(normalize(item.facts)))) continue;
        knownSlugs.add(item.slug);
        knownTitles.add(normalize(item.topic));
        proposals.push(item);
    }
    return proposals;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--plan')) throw new Error('Usage: node scripts/seo-automation.mjs [--plan]');
    const curated = JSON.parse(await readFile(resolve(directory, 'briefs.json'), 'utf8'));
    const suggestionsFile = resolve(directory, 'automated-briefs.json');
    const savedBriefs = JSON.parse(await readFile(suggestionsFile, 'utf8').catch(error => {
        if (error.code === 'ENOENT') return '[]';
        throw error;
    }));
    const briefs = [...curated, ...savedBriefs.filter(item => !curated.some(brief => brief.slug === item.slug))];
    const records = await loadRecords();
    const target = Number(process.env.SEO_MONTHLY_ARTICLES || 15);
    const today = new Date();
    const { month, capacity, fresh, updates } = planBatch(briefs, records, target, today);
    const openSlots = capacity - fresh.length;
    console.log(month + ' India: ' + fresh.length + ' new candidates, ' + updates.length + ' refresh candidates; ' + openSlots + ' additional eligible slots.');
    if (args.includes('--plan')) {
        for (const entry of [...fresh, ...updates]) console.log(entry.brief.slug);
        return;
    }
    if (!capacity && !updates.length) return;
    if (!process.env.GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY.');
    const { callGemini } = await import('../api/_lib/geminiService.js');
    const proposals = [];
    while (proposals.length < openSlots) {
        const batch = await suggestBriefs([...briefs, ...proposals], records, Math.min(openSlots - proposals.length, 5), callGemini);
        if (!batch.length) break;
        proposals.push(...batch);
    }
    const newCandidates = planBatch([...briefs, ...proposals], records, target, today).fresh;
    const acceptedBriefs = [];
    let accepted = 0;
    let failed = 0;
    for (const candidate of [...updates, ...newCandidates]) {
        const { brief, revision, existing } = candidate;
        try {
            const article = await draftArticle(candidate, callGemini);
            const content = validateCandidate(article, brief.slug, records, existing);
            if (!content || !await reviewArticle(candidate, article, callGemini)) {
                console.log('Skipped ' + brief.slug + ' (unchanged or review rejected).');
                continue;
            }
            const release = {
                sha256: digest(content), content,
                automation: { revision, publishedMonth: existing?.automation.publishedMonth ?? month },
            };
            await writeApprovedArticle(brief.slug, release);
            records.set(brief.slug, { ...release, article });
            if (proposals.some(proposal => proposal.slug === brief.slug)) acceptedBriefs.push(brief);
            accepted++;
            console.log('Accepted ' + brief.slug);
        } catch {
            failed++;
            console.error('Skipped ' + brief.slug + ' (draft generation or validation failed).');
        }
    }
    if (acceptedBriefs.length) {
        await writeFile(suggestionsFile, JSON.stringify([...savedBriefs, ...acceptedBriefs], null, 2) + '\n');
    }
    if (failed && failed === updates.length + newCandidates.length) throw new Error('Every planned candidate failed generation or validation.');
    if (!accepted) console.log('No eligible new or changed articles passed review.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
