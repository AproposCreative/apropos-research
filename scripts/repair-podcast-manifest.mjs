#!/usr/bin/env node
/**
 * Normaliser podcasts/manifest.json til iOS PodcastManifest-format.
 * Bevarer firebaseStorageDownloadTokens på manifest-filen.
 */
import { config } from 'dotenv';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env.local') });

const require = createRequire(join(root, 'package.json'));
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');

const MANIFEST_PATH = 'podcasts/manifest.json';
const DEFAULT_MANIFEST_TOKEN = '2e7823c1-fc8f-4a77-bfe2-667acbb3ad40';
const BUCKET =
  process.env.PODCAST_STORAGE_BUCKET ||
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  'apropos-magazine-6004a.firebasestorage.app';

function slugToId(slug) {
  const compact = slug.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return compact || slug;
}

function publicAudioUrl(slug, token) {
  const path = `podcasts/articles/${slug}/audio.m4a`;
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

function extractToken(metadata) {
  const raw = metadata?.metadata?.firebaseStorageDownloadTokens;
  if (!raw) return null;
  return String(raw).split(',')[0].trim() || null;
}

function normalizeEpisode(raw, audioUrlBySlug) {
  const articleSlug = String(raw.articleSlug || raw.slug || '').trim();
  const title = String(raw.title || '').trim();
  if (!articleSlug || !title) return null;

  let audioURL = String(raw.audioURL || raw.audioUrl || '').trim();
  if (!audioURL && audioUrlBySlug.has(articleSlug)) {
    audioURL = audioUrlBySlug.get(articleSlug);
  }
  if (!audioURL) return null;

  const hostsRaw = raw.hosts;
  const hosts = Array.isArray(hostsRaw)
    ? hostsRaw.map((h) => String(h).trim()).filter(Boolean)
    : ['Apropos Magazine'];

  return {
    id: String(raw.id || slugToId(articleSlug)),
    articleSlug,
    title,
    subtitle: String(raw.subtitle || 'Lyt til artiklen'),
    audioURL,
    hosts: hosts.length ? hosts : ['Apropos Magazine'],
    publishedAt: String(raw.publishedAt || new Date().toISOString()),
  };
}

function initAdmin() {
  if (getApps().length) return;
  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  } else {
    const { applicationDefault } = require('firebase-admin/app');
    initializeApp({ credential: applicationDefault(), projectId });
  }
}

async function main() {
  initAdmin();
  const bucket = getStorage().bucket(BUCKET);
  const manifestFile = bucket.file(MANIFEST_PATH);

  const [exists] = await manifestFile.exists();
  if (!exists) {
    console.error('Manifest findes ikke:', MANIFEST_PATH);
    process.exit(1);
  }

  const [meta] = await manifestFile.getMetadata();
  const manifestToken =
    extractToken(meta) || process.env.PODCAST_MANIFEST_TOKEN || DEFAULT_MANIFEST_TOKEN;

  const [buf] = await manifestFile.download();
  const parsed = JSON.parse(buf.toString('utf8'));
  const rawEpisodes = Array.isArray(parsed.episodes) ? parsed.episodes : [];

  const audioUrlBySlug = new Map();
  const [files] = await bucket.getFiles({ prefix: 'podcasts/articles/' });
  for (const file of files) {
    const match = file.name.match(/^podcasts\/articles\/([^/]+)\/audio\.m4a$/);
    if (!match) continue;
    const slug = match[1];
    const [fileMeta] = await file.getMetadata();
    const token = extractToken(fileMeta);
    if (token) audioUrlBySlug.set(slug, publicAudioUrl(slug, token));
  }

  const seen = new Set();
  const episodes = [];
  for (const raw of rawEpisodes) {
    const ep = normalizeEpisode(raw, audioUrlBySlug);
    if (!ep || seen.has(ep.articleSlug)) continue;
    seen.add(ep.articleSlug);
    episodes.push(ep);
  }

  episodes.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const manifest = {
    version: 1,
    updatedAt: new Date().toISOString(),
    episodes,
  };

  await manifestFile.save(JSON.stringify(manifest, null, 2), {
    resumable: false,
    metadata: {
      contentType: 'application/json',
      cacheControl: 'public, max-age=300',
      metadata: { firebaseStorageDownloadTokens: manifestToken },
    },
  });

  console.log(`Repareret manifest: ${episodes.length} episoder`);
  console.log(`Token bevaret: ${manifestToken.slice(0, 8)}…`);
  for (const ep of episodes) {
    console.log(`  - ${ep.articleSlug}: ${ep.title}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
