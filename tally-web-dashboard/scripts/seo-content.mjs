import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { siteOrigin, searchPages } from '../src/config/searchPages.mjs';

export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const digest = text => createHash('sha256').update(text).digest('hex');
export const escapeHtml = text => text.replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const validText = (text, max) => typeof text === 'string' && text.trim().length > 0 && text.length <= max;

export function readArticle(text, slug) {
    const article = JSON.parse(text);
    if (!slugPattern.test(slug) || article?.slug !== slug
        || !validText(article.title, 90) || !validText(article.description, 170)
        || !Array.isArray(article.sections) || article.sections.length < 2 || article.sections.length > 12
        || article.sections.some(section => !section || !validText(section.heading, 110) || !validText(section.body, 3000))
        || !Array.isArray(article.relatedPaths) || article.relatedPaths.length === 0
        || article.relatedPaths.some(path => !Object.hasOwn(searchPages, path))) {
        throw new Error('Invalid article format or unrecognized related page for ' + slug);
    }
    return article;
}

export async function loadApprovedArticles() {
    const directory = resolve('content/seo/approved');
    const files = await readdir(directory).catch(error => {
        if (error.code === 'ENOENT') return [];
        throw error;
    });
    return Promise.all(files.filter(file => file.endsWith('.json')).sort().map(async file => {
        const raw = await readFile(resolve(directory, file), 'utf8');
        const release = JSON.parse(raw);
        if (typeof release.content !== 'string' || digest(release.content) !== release.sha256) {
            throw new Error('Approved article needs a new review: ' + file);
        }
        return readArticle(release.content, file.slice(0, -5));
    }));
}

export async function approveArticle(slug, revision) {
    if (!slugPattern.test(slug) || !/^[a-f0-9]{64}$/.test(revision ?? '')) {
        throw new Error('Supply the article slug and the SHA-256 from the review command.');
    }
    const content = await readFile(resolve('content/seo/drafts', slug + '.json'), 'utf8');
    readArticle(content, slug);
    if (digest(content) !== revision) throw new Error('Draft changed after review. Review the current revision.');
    await writeApprovedArticle(slug, { sha256: revision, content });
}

export async function writeApprovedArticle(slug, release) {
    if (!slugPattern.test(slug) || digest(release.content) !== release.sha256) throw new Error('Invalid release snapshot');
    const directory = resolve('content/seo/approved');
    await mkdir(directory, { recursive: true });
    const pending = resolve(directory, randomUUID() + '.tmp');
    try {
        await writeFile(pending, JSON.stringify(release, null, 2) + '\n');
        await rename(pending, resolve(directory, slug + '.json'));
    } finally {
        await rm(pending, { force: true });
    }
}

function articleShell({ path, title, description, body }) {
    const canonical = siteOrigin + path;
    return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<title>' + escapeHtml(title) + ' | Syncora</title>' +
        '<meta name="description" content="' + escapeHtml(description) + '">' +
        '<meta name="robots" content="index, follow"><link rel="canonical" href="' + canonical + '">' +
        '<meta property="og:title" content="' + escapeHtml(title) + '">' +
        '<meta property="og:description" content="' + escapeHtml(description) + '">' +
        '<meta property="og:url" content="' + canonical + '">' +
        '<meta property="og:image" content="' + siteOrigin + '/syncora-social.png">' +
        '<link rel="icon" href="/app_icon.svg"><style>' +
        ':root{color-scheme:light;font:100%/1.65 system-ui,sans-serif;background:#f4f8fb;color:#132d3b}' +
        'body{margin:0}header{background:#fff;border-bottom:1px solid #d6e4ec}nav,main{max-width:720px;margin:auto;padding:1rem 1.25rem}' +
        'nav{display:flex;gap:1.25rem;flex-wrap:wrap}a{color:#075c78;text-underline-offset:.2em}main{padding-block:2.5rem 4rem}' +
        'h1{font-size:clamp(2rem,7vw,3.25rem);line-height:1.08;letter-spacing:-.035em;margin:.5rem 0 1rem}' +
        'h2{line-height:1.25;margin:1.75rem 0 .5rem}p,li{overflow-wrap:anywhere}li+li{margin-top:.65rem}.intro{font-size:1.15rem}.topics ul{list-style:none;display:flex;flex-wrap:wrap;gap:.6rem;padding:0}.topics li{margin:0}.topics a{display:block;background:#e1eff6;border-radius:2rem;padding:.35rem .8rem}h2[id]{scroll-margin-top:1rem}' +
        '</style></head><body><header><nav><a href="/">Syncora</a><a href="/resources">Resources</a><a href="/support">Support</a></nav></header>' +
        '<main><h1>' + escapeHtml(title) + '</h1><p class="intro">' + escapeHtml(description) + '</p>' +
        body + '</main></body></html>';
}

export function renderResourcePages(articles) {
    const resourceLinks = ['/guides/tallyprime-setup', '/guides/tally-ledger-on-mobile', '/guides/tally-sync-troubleshooting'];
    const link = path => '<li><a href="' + path + '">' + escapeHtml(searchPages[path][0]) + '</a></li>';
    const groups = new Map(['Setup', 'Vouchers and Day Book', 'Ledgers and PDFs', 'Sync troubleshooting',
        'Stock and balances', 'Accountant and team workflows', 'More accounting guides'].map(label => [label, []]));
    for (const article of articles) {
        const group = groups.get(article.category) ?? groups.get('More accounting guides');
        group.push(article);
    }
    const sections = [...groups].filter(([, items]) => items.length);
    const sectionAnchor = label => label.toLowerCase().replaceAll(' ', '-');
    const links = sections.map(([label]) => '<li><a href="#' + sectionAnchor(label) + '">' + escapeHtml(label) + '</a></li>');
    const hub = {
        path: '/resources',
        title: 'TallyPrime Resources',
        description: 'Practical guides for setting up Syncora, checking TallyPrime vouchers, exporting ledgers and reviewing synced records with your team.',
        body: '<h2>Start here</h2><ul>' + resourceLinks.map(link).join('') + '</ul>' +
            (links.length ? '<div class="topics"><h2>Browse by topic</h2><ul>' + links.join('') + '</ul></div>' : '') +
            sections.map(([label, items]) => '<section aria-labelledby="' + sectionAnchor(label) + '"><h2 id="' +
                sectionAnchor(label) + '">' + escapeHtml(label) + '</h2><ul>' + items.map(article =>
                    '<li><a href="/resources/' + article.slug + '">' + escapeHtml(article.title) + '</a></li>').join('') + '</ul></section>').join(''),
    };
    const pages = articles.map(article => ({
        path: '/resources/' + article.slug,
        title: article.title,
        description: article.description,
        body: '<article>' + article.sections.map(section =>
            '<section><h2>' + escapeHtml(section.heading) + '</h2><p>' + escapeHtml(section.body) + '</p></section>').join('') +
            '</article><h2>Related guides</h2><ul>' + article.relatedPaths.map(link).join('') + '</ul>',
    }));
    return [hub, ...pages].map(page => ({ path: page.path, html: articleShell(page) }));
}

