#!/usr/bin/env node
/**
 * Fuld podcast E2E: manifest → validate → upload → process → status → verify.
 *
 *   TEST_BASE_URL=https://ai.aproposmagazine.com node scripts/test-podcast-e2e.mjs
 *   node scripts/test-podcast-e2e.mjs --skip-process   # upload smoke only
 */
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env.local') });

const BASE = process.env.TEST_BASE_URL || 'https://ai.aproposmagazine.com';
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const BUCKET =
  process.env.PODCAST_STORAGE_BUCKET ||
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const MANIFEST_TOKEN =
  process.env.PODCAST_MANIFEST_TOKEN || '2e7823c1-fc8f-4a77-bfe2-667acbb3ad40';
const TEST_UID = 'podcast-e2e-test';
const skipProcess = process.argv.includes('--skip-process');

const results = [];

function pass(label, detail = '') {
  results.push({ ok: true, label, detail });
  console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail = '') {
  results.push({ ok: false, label, detail });
  console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

function initAdmin() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

async function getIdToken() {
  const auth = getAuth(initAdmin());
  const customToken = await auth.createCustomToken(TEST_UID);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`signInWithCustomToken: ${JSON.stringify(data)}`);
  return data.idToken;
}

async function api(method, path, idToken, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function validateIosEpisode(ep) {
  const required = ['id', 'articleSlug', 'title', 'audioURL', 'hosts', 'publishedAt'];
  for (const key of required) {
    if (ep[key] === undefined || ep[key] === null || ep[key] === '') return false;
  }
  if (!Array.isArray(ep.hosts) || ep.hosts.length === 0) return false;
  if (!ep.audioURL.startsWith('https://')) return false;
  return true;
}

async function checkPublicManifest() {
  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/podcasts%2Fmanifest.json?alt=media&token=${MANIFEST_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) {
    fail('Public manifest', `HTTP ${res.status}`);
    return null;
  }
  const manifest = await res.json();
  if (!Array.isArray(manifest.episodes) || manifest.episodes.length === 0) {
    fail('Public manifest', 'ingen episoder');
    return null;
  }
  const bad = manifest.episodes.filter((e) => !validateIosEpisode(e));
  if (bad.length) {
    fail('Public manifest iOS-format', `${bad.length} ugyldige entries`);
    return null;
  }
  pass('Public manifest iOS-format', `${manifest.episodes.length} episoder`);
  const cape = manifest.episodes.find((e) => e.articleSlug === 'cape-fear-apple-tv');
  if (cape) pass('Cape Fear i manifest', cape.title);
  else fail('Cape Fear i manifest');
  return manifest;
}

/** Pipeline-test bruger ældre episode — ikke nyeste (fx cape-fear). */
const PIPELINE_TEST_SLUGS = ['the-moment-anmeldelse', 'backrooms-anmeldelse', 'o-days-2026-guide'];
const VALIDATE_PROBE_SLUG = 'cape-fear-apple-tv';

async function resolveArticle(idToken, slug) {
  const url = `https://www.aproposmagazine.com/articles/${slug}`;
  const v = await api('POST', '/api/podcast/validate', idToken, { articleUrl: url });
  if (v.status === 200 && v.json.ok) {
    return { slug: v.json.slug, title: v.json.title, url: v.json.articleUrl || url };
  }
  return null;
}

async function findPipelineTestArticle(idToken) {
  for (const slug of PIPELINE_TEST_SLUGS) {
    const article = await resolveArticle(idToken, slug);
    if (article) return article;
  }
  throw new Error('Ingen artikel til pipeline-test kunne valideres');
}

function makeTestAudio(tmpPath) {
  const ff = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      '-movflags',
      '+faststart',
      tmpPath,
    ],
    { encoding: 'utf8' }
  );
  if (ff.status !== 0 || !existsSync(tmpPath)) {
    throw new Error(`ffmpeg test audio: ${ff.stderr || ff.stdout}`);
  }
  return readFileSync(tmpPath);
}

async function uploadIncoming(storagePath, idToken, bytes) {
  const name = encodeURIComponent(storagePath);
  const res = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${name}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Firebase ${idToken}`,
        'Content-Type': 'audio/mp4',
      },
      body: bytes,
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Storage upload ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function pollJob(idToken, jobId, timeoutMs = 240000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { status, json } = await api('GET', `/api/podcast/status/${jobId}`, idToken);
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (json.status === 'done') return json;
    if (json.status === 'error') {
      throw new Error(`Pipeline fejl ved ${json.failedStep}: ${json.error}`);
    }
    process.stdout.write(`  … ${json.step} (${json.status})\r`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Timeout — pipeline færdiggjorde ikke inden for 4 min');
}

async function checkNotifyEndpoint() {
  const url = process.env.PODCAST_NOTIFY_URL?.trim();
  const secret = process.env.PODCAST_NOTIFY_SECRET?.trim();
  if (!url || !secret) {
    fail('Push-notify env', 'PODCAST_NOTIFY_URL/SECRET mangler lokalt');
    return;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Apropos-Podcast-Secret': secret,
    },
    body: JSON.stringify({
      articleSlug: 'cape-fear-apple-tv',
      title: 'E2E test (ignorer)',
    }),
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* ignore */
  }
  if (res.ok) {
    pass('Push-notify endpoint', `HTTP ${res.status} ${json.status || ''}`.trim());
  } else {
    fail('Push-notify endpoint', `${res.status}: ${json.message || text.slice(0, 120)}`);
  }
}

async function checkFfmpegStatic() {
  const binPath = join(root, 'node_modules/ffmpeg-static/ffmpeg');
  if (existsSync(binPath)) {
    pass('ffmpeg-static binær', 'node_modules/ffmpeg-static/ffmpeg');
    return;
  }
  const which = spawnSync('which', ['ffmpeg'], { encoding: 'utf8' });
  const sys = which.stdout?.trim();
  if (sys && existsSync(sys)) {
    pass('ffmpeg (system)', sys);
  } else {
    fail('ffmpeg-static binær', 'hverken pakke eller system-ffmpeg fundet');
  }
}

async function main() {
  console.log(`\nPodcast E2E — ${BASE}\n`);

  await checkFfmpegStatic();
  await checkPublicManifest();
  await checkNotifyEndpoint();

  console.log('\nAPI-flow med auth…');
  const idToken = await getIdToken();
  pass('Firebase auth token');

  const probe = await resolveArticle(idToken, VALIDATE_PROBE_SLUG);
  if (probe) pass('Validate artikel (probe)', probe.title);
  else fail('Validate artikel (probe)', VALIDATE_PROBE_SLUG);

  const article = skipProcess ? probe : await findPipelineTestArticle(idToken);
  if (!article) throw new Error('Ingen artikel til test');
  if (!skipProcess) pass('Pipeline-test artikel', `${article.slug} — ${article.title}`);

  const manifest = await api('GET', '/api/podcast/manifest?limit=5', idToken);
  if (manifest.status === 200 && manifest.json.ok && manifest.json.episodes?.length) {
    pass('Manifest API', `${manifest.json.episodes.length} episoder`);
  } else {
    fail('Manifest API', `${manifest.status}`);
  }

  const tmp = join(root, 'scripts', '.podcast-e2e-audio.m4a');
  const bytes = makeTestAudio(tmp);
  pass('Test-lyd genereret', `${(bytes.length / 1024).toFixed(1)} KB`);

  const slug = article.slug;
  const uploadUrl = await api('POST', '/api/podcast/upload-url', idToken, {
    slug,
    contentType: 'audio/mp4',
    sizeBytes: bytes.length,
    fileExtension: '.m4a',
  });
  if (uploadUrl.status !== 200 || !uploadUrl.json.ok) {
    fail('Upload-url', JSON.stringify(uploadUrl.json));
    throw new Error('upload-url stoppede testen');
  }
  pass('Upload-url', uploadUrl.json.storagePath);

  await uploadIncoming(uploadUrl.json.storagePath, idToken, bytes);
  pass('Storage upload incoming');

  if (skipProcess) {
    console.log('\n--skip-process: springer pipeline over');
  } else {
    console.log('\nKører pipeline på server…');
    const processRes = await api('POST', '/api/podcast/process', idToken, {
      slug,
      articleUrl: article.url,
    });
    if (processRes.status !== 200 || !processRes.json.ok) {
      fail('Process start', `${processRes.status} ${JSON.stringify(processRes.json)}`);
      throw new Error('process stoppede testen');
    }
    const jobId = processRes.json.jobId;
    pass('Process start', jobId);

    const done = await pollJob(idToken, jobId);
    pass('Pipeline færdig', `step=${done.step}`);

    const bucket = getStorage().bucket(BUCKET);
    const published = bucket.file(`podcasts/articles/${slug}/audio.m4a`);
    const [pubExists] = await published.exists();
    if (pubExists) {
      const [meta] = await published.getMetadata();
      const size = Number(meta.size || 0);
      pass('Publiceret lyd i Storage', `${(size / 1024).toFixed(1)} KB`);
    } else {
      fail('Publiceret lyd i Storage');
    }

    await checkPublicManifest();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'='.repeat(40)}`);
  console.log(`${results.length - failed.length}/${results.length} checks bestået`);
  if (failed.length) {
    console.error('\nFejlede:');
    for (const f of failed) console.error(`  - ${f.label}: ${f.detail}`);
    process.exit(1);
  }
  console.log('\nAlt OK — upload og pipeline virker.\n');
}

main()
  .catch((err) => {
    console.error('\nFEJL:', err.message || err);
    process.exit(1);
  })
  .finally(() => {
    try {
      unlinkSync(join(root, 'scripts', '.podcast-e2e-audio.m4a'));
    } catch {
      /* ignore */
    }
  });
