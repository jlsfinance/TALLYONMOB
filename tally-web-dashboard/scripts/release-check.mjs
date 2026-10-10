import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

check(fs.existsSync(path.join(dist, 'index.html')), 'dist/index.html is missing; run the production build first');
check(fs.existsSync(path.join(dist, 'sw.js')), 'dist/sw.js is missing; PWA service worker was not generated');
check(fs.existsSync(path.join(dist, 'manifest.json')), 'dist/manifest.json is missing');

if (fs.existsSync(path.join(dist, 'index.html'))) {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter((value) => value.startsWith('/'));
  for (const asset of assets) {
    const relativeAsset = asset.replace(/^\/TALLYONMOB\//, '').replace(/^\//, '');
    const assetPath = path.join(dist, relativeAsset);
    check(fs.existsSync(assetPath), `referenced build asset is missing: ${asset}`);
  }
  check(/<meta name="description"/.test(html), 'production HTML has no description metadata');
  check(/<link rel="manifest"/.test(html), 'production HTML has no manifest link');
}

if (fs.existsSync(path.join(dist, 'manifest.json'))) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
  check(Boolean(manifest.name), 'manifest.name is missing');
  check(Boolean(manifest.start_url), 'manifest.start_url is missing');
  check(Boolean(manifest.icons?.length), 'manifest has no icons');
}

const sourceChecks = [
  ['src/main.tsx', /vite:preloadError/, 'chunk-load recovery listener'],
  ['src/main.tsx', /updateViaCache:\s*[\'"]none[\'"]/, 'service worker cache bypass'],
  ['src/components/common/AppErrorBoundary.tsx', /role="alert"/, 'accessible error recovery landmark'],
  ['src/components/common/AppErrorBoundary.tsx', /Incident:/, 'incident identifier'],
  ['src/components/OfflineIndicator.tsx', /aria-live="polite"/, 'offline live region'],
];
for (const [file, pattern, description] of sourceChecks) check(pattern.test(read(file)), `${description} is missing from ${file}`);

const files = fs.existsSync(dist) ? fs.readdirSync(dist, { recursive: true }) : [];
const jsBytes = files.filter((file) => String(file).endsWith('.js')).reduce((total, file) => total + fs.statSync(path.join(dist, file)).size, 0);
check(jsBytes < 12 * 1024 * 1024, `JavaScript output is unexpectedly large: ${Math.round(jsBytes / 1024 / 1024)} MB`);

if (failures.length) {
  console.error('Release checks failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Release checks passed (${Math.round(jsBytes / 1024)} KB JavaScript output).`);
