import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { getSearchPage, productSchema, searchPages, siteOrigin, socialImage } from '../src/config/searchPages.mjs';

import { digest, loadApprovedArticles, renderResourcePages } from './seo-content.mjs';

const dist = resolve('dist');
const manifestPath = resolve(dist, 'seo-client-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const template = await readFile(resolve(dist, 'index.html'), 'utf8');
const escape = value => String(value).replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const meta = (attribute, key, value) => `<meta ${attribute}="${key}" content="${escape(value)}" />`;
const robots = meta('name', 'robots', 'noindex, follow');

// Keep the SPA/API routes working while serving a separate HTML response for public URLs.
const base = template
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\b[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel="canonical"[^>]*>/gi, '')
    .replace(/<noscript>[\s\S]*?<\/noscript>/i, '');
if (!base.includes('<div id="root"></div>')) throw new Error('App root missing from built HTML');

const staticGuidePaths = new Set(['/product-overview', '/guides/tally-sync-troubleshooting']);
const staticGuideBase = base
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*(?:rel="(?:modulepreload|manifest)"|href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"]*")[^>]*>/gi, '');

const server = await createServer({
    configFile: false,
    mode: 'production',
    plugins: [react()],
    resolve: { alias: { '@': resolve('src') } },
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
});
try {
    const { renderSearchPage } = await server.ssrLoadModule('/scripts/searchRender.tsx');
    const outputs = [];
    for (const path of [...Object.keys(searchPages), '/syncora']) {
        const { title, description, canonical } = getSearchPage(path);
        const { file, markup } = renderSearchPage(path);
        const styles = new Set();
        const visited = new Set();
        const addStyles = id => {
            if (visited.has(id)) return;
            visited.add(id);
            const chunk = manifest[id];
            if (!chunk) throw new Error(`Missing client manifest entry: ${id}`);
            chunk.css?.forEach(style => styles.add(style));
            chunk.imports?.forEach(addStyles);
        };
        addStyles(file);
        const head = [
            `<title>${escape(title)}</title>`,
            meta('name', 'description', description),
            meta('name', 'robots', 'index, follow, max-image-preview:large'),
            `<link rel="canonical" href="${escape(canonical)}" />`,
            meta('property', 'og:type', 'website'),
            meta('property', 'og:site_name', 'Syncora'),
            meta('property', 'og:title', title),
            meta('property', 'og:description', description),
            meta('property', 'og:url', canonical),
            meta('property', 'og:image', socialImage),
            meta('property', 'og:image:width', '1200'),
            meta('property', 'og:image:height', '630'),
            meta('property', 'og:image:alt', 'Syncora — Tally on mobile and web'),
            meta('name', 'twitter:card', 'summary_large_image'),
            meta('name', 'twitter:title', title),
            meta('name', 'twitter:description', description),
            meta('name', 'twitter:image', socialImage),
            ...[...styles].filter(style => !base.includes(`href="/${style}"`))
                .map(style => `<link rel="stylesheet" href="/${escape(style)}" />`),
        ];
        if (canonical === siteOrigin + '/') {
            const json = JSON.stringify(productSchema).replaceAll('<', '\\u003c');
            head.push(`<script id="public-search-schema" type="application/ld+json">${json}</script>`);
        }
        const pageBase = staticGuidePaths.has(path) ? staticGuideBase : base;
        const html = pageBase.replace('</head>', () => `${head.join('\n')}\n</head>`)
            .replace('<div id="root"></div>', () => `<div id="root">${markup}</div>`);
        const output = resolve(dist, path === '/' ? 'index.html' : `search-pages${path}.html`);
        outputs.push([output, html]);
    }
    const resources = renderResourcePages(await loadApprovedArticles());
    for (const { path, html } of resources) outputs.push([resolve(dist, 'search-pages' + path + '.html'), html]);
    for (const [output, html] of outputs) {
        await mkdir(dirname(output), { recursive: true });
        await writeFile(output, html);
    }
    await writeFile(resolve(dist, 'app-shell.html'), base.replace('</head>', `<title>Syncora</title>${robots}</head>`));
    const publicPaths = [...Object.keys(searchPages), ...resources.map(page => page.path)];
    const locations = publicPaths.map(path => `  <url><loc>${escape(new URL(path, siteOrigin).href)}</loc></url>`);
    await writeFile(resolve(dist, 'sitemap.xml'), [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...locations, '</urlset>', '',
    ].join('\n'));
    await writeFile(resolve(dist, 'seo-content-revision.txt'), digest(JSON.stringify(resources)) + '\n');
    await rm(manifestPath);
    console.log(`Rendered ${publicPaths.length} indexable Syncora pages.`);
} finally {
    await server.close();
}
