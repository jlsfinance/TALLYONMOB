import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { approveArticle, digest, readArticle, slugPattern } from './seo-content.mjs';

import { callGemini } from '../api/_lib/geminiService.js';
import { searchPages } from '../src/config/searchPages.mjs';

const [command, slug, revision] = process.argv.slice(2);
try {
    if (command === 'list') {
        const files = await readdir(resolve('content/seo/drafts'));
        for (const file of files.filter(name => name.endsWith('.json')).sort()) {
            const article = readArticle(await readFile(resolve('content/seo/drafts', file), 'utf8'), file.slice(0, -5));
            console.log(article.slug + '  ' + article.title);
        }
    } else if (command === 'draft' && slugPattern.test(slug ?? '') && revision?.trim()) {
        const output = resolve('content/seo/drafts', slug + '.json');
        const existing = await readFile(output).catch(error => {
            if (error.code === 'ENOENT') return null;
            throw error;
        });
        if (existing) throw new Error('A draft with that slug already exists.');
        const result = await callGemini({
            systemPrompt: 'Write a public Syncora article draft for a human editor. Return one JSON object with slug, title, description, sections (objects with heading and body), and relatedPaths. Use plain text. Only make product claims supported by the supplied public page summaries. Do not invent prices, ratings, guarantees, citations or search statistics.',
            userPrompt: JSON.stringify({ slug, editorialBrief: revision, publicPages: searchPages }),
            expectJson: true,
        });
        if (!result.ok) throw new Error('Gemini could not return a valid article draft.');
        const content = JSON.stringify(result.json, null, 2) + '\n';
        readArticle(content, slug);
        await writeFile(output, content, { flag: 'wx' });
        console.log('Draft generated. Review the content before approval.');
    } else if (command === 'review' && slugPattern.test(slug ?? '')) {
        const content = await readFile(resolve('content/seo/drafts', slug + '.json'), 'utf8');
        readArticle(content, slug);
        console.log(content.trim());
        console.log('Revision: ' + digest(content));
    } else if (command === 'approve') {
        await approveArticle(slug, revision);
        console.log('Approved ' + slug + ' for the next web build.');
    } else {
        throw new Error('Usage: npm run seo:content -- list | draft <slug> <brief> | review <slug> | approve <slug> <revision>');
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}

