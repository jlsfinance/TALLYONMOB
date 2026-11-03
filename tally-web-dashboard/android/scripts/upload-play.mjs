#!/usr/bin/env node
// Upload an AAB to Google Play without fastlane or Gradle plugins.
// Auth: service account JSON from Google Cloud, granted in Play Console.
//
//   node scripts/upload-play.mjs --check
//   node scripts/upload-play.mjs --aab app/build/outputs/bundle/release/app-release.aab --track internal --notes "Bug fixes"
//   node scripts/upload-play.mjs --listing ../../../play-store-assets/listing.json
//   (both flags together = one edit, one commit)
//
// Env: PLAY_KEY (default ../../../.secrets/play-service-account.json), PLAY_PACKAGE (default com.syncoraa.app)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE = process.env.PLAY_PACKAGE || 'com.syncoraa.app';
const KEY_PATH = process.env.PLAY_KEY || path.resolve(here, '../../../.secrets/play-service-account.json');
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]?.startsWith('--') ? true : arr[i + 1] ?? true]);
    return acc;
  }, [])
);

const fail = (msg) => { console.error('ERROR:', msg); process.exit(1); };

async function token() {
  if (!fs.existsSync(KEY_PATH)) fail(`service account key not found: ${KEY_PATH}`);
  const key = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const jwt = `${unsigned}.${crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const body = await res.json();
  if (!body.access_token) fail(`token exchange failed: ${JSON.stringify(body).slice(0, 300)}`);
  return { token: body.access_token, email: key.client_email };
}

async function call(tok, method, url, body, headers = {}) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) fail(`${method} ${url} -> ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

const { token: tok, email } = await token();
console.log(`auth ok as ${email}`);

if (args.check) {
  const edit = await call(tok, 'POST', `/applications/${PACKAGE}/edits`, {});
  await call(tok, 'DELETE', `/applications/${PACKAGE}/edits/${edit.id}`);
  console.log(`OK — service account can publish ${PACKAGE}`);
  process.exit(0);
}

if (args.status) {
  const edit = await call(tok, 'POST', `/applications/${PACKAGE}/edits`, {});
  const { tracks = [] } = await call(tok, 'GET', `/applications/${PACKAGE}/edits/${edit.id}/tracks`);
  for (const t of tracks) {
    const codes = (t.releases || []).flatMap((r) => r.versionCodes || []);
    if (codes.length) console.log(`track ${t.track}: ${codes.join(',')} (${(t.releases || []).map((r) => r.status).join(',')})`);
  }
  const { listings = [] } = await call(tok, 'GET', `/applications/${PACKAGE}/edits/${edit.id}/listings`);
  for (const l of listings) {
    const parts = [];
    for (const type of ['icon', 'featureGraphic', 'phoneScreenshots', 'sevenInchScreenshots', 'tenInchScreenshots']) {
      const { images = [] } = await call(tok, 'GET', `/applications/${PACKAGE}/edits/${edit.id}/listings/${l.language}/${type}`);
      if (images.length) parts.push(`${type}=${images.length}`);
    }
    console.log(`listing ${l.language}: "${l.title}" | ${parts.join(' ')}`);
  }
  await call(tok, 'DELETE', `/applications/${PACKAGE}/edits/${edit.id}`);
  process.exit(0);
}

const aabPath = args.aab && args.aab !== true ? path.resolve(args.aab) : null;
if (aabPath && !fs.existsSync(aabPath)) fail(`AAB not found: ${aabPath}`);
if (aabPath && path.extname(aabPath) !== '.aab') fail('Google Play needs an .aab, not an .apk');
if (!aabPath && !args.listing) fail('pass --aab <path to .aab> and/or --listing <listing.json>');
const track = args.track || 'internal';
const notes = args.notes || '';

const edit = await call(tok, 'POST', `/applications/${PACKAGE}/edits`, {});
console.log(`edit ${edit.id}`);

if (aabPath) {
  const uploadRes = await fetch(
    `${UPLOAD}/applications/${PACKAGE}/edits/${edit.id}/bundles?uploadType=media`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/octet-stream' },
      body: fs.readFileSync(aabPath),
    }
  );
  const uploadText = await uploadRes.text();
  if (!uploadRes.ok) fail(`upload failed -> ${uploadRes.status} ${uploadText.slice(0, 400)}`);
  const bundle = JSON.parse(uploadText);
  console.log(`uploaded versionCode ${bundle.versionCode}`);

  await call(tok, 'PUT', `/applications/${PACKAGE}/edits/${edit.id}/tracks/${track}`, {
    track,
    releases: [{ versionCodes: [String(bundle.versionCode)], status: 'completed', ...(notes ? { releaseNotes: [{ language: 'en-IN', text: notes }] } : {}) }],
  });
  console.log(`assigned to ${track}`);
}

if (args.listing) {
  const listingPath = path.resolve(args.listing);
  const dir = path.dirname(listingPath);
  const L = JSON.parse(fs.readFileSync(listingPath, 'utf8'));
  const { listings = [] } = await call(tok, 'GET', `/applications/${PACKAGE}/edits/${edit.id}/listings`);
  const langs = listings.map((l) => l.language);
  const language = langs.includes('en-IN') ? 'en-IN' : langs.find((l) => l.startsWith('en')) || 'en-US';
  console.log(`listing language ${language} (existing: ${langs.join(',') || 'none'})`);

  await call(tok, 'PUT', `/applications/${PACKAGE}/edits/${edit.id}/listings/${language}`, {
    language,
    title: L.title,
    shortDescription: L.shortDescription,
    fullDescription: L.fullDescription,
  });
  console.log(`text updated: "${L.title}"`);

  const putImage = async (imageType, file) => {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) fail(`image not found: ${p}`);
    const res = await fetch(
      `${UPLOAD}/applications/${PACKAGE}/edits/${edit.id}/listings/${language}/${imageType}?uploadType=media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'image/png' },
        body: fs.readFileSync(p),
      }
    );
    const text = await res.text();
    if (!res.ok) fail(`${imageType} upload failed -> ${res.status} ${text.slice(0, 300)}`);
    console.log(`  ${imageType} <- ${file}`);
  };

  // clear first so re-runs replace instead of appending duplicates
  const clearImages = (imageType) =>
    call(tok, 'DELETE', `/applications/${PACKAGE}/edits/${edit.id}/listings/${language}/${imageType}`);

  if (L.icon) { await clearImages('icon'); await putImage('icon', L.icon); }
  if (L.featureGraphic) { await clearImages('featureGraphic'); await putImage('featureGraphic', L.featureGraphic); }
  if (L.screenshots?.length) await clearImages('phoneScreenshots');
  for (const shot of L.screenshots || []) await putImage('phoneScreenshots', shot);
}

await call(tok, 'POST', `/applications/${PACKAGE}/edits/${edit.id}:commit`);
console.log('committed — Play Console me review ke liye chala gaya');
