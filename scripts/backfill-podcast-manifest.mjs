#!/usr/bin/env node
/**
 * Backfill RSS-felter på eksisterende episoder i podcasts/manifest.json:
 *   audioBytes (fra Storage object size), guid, imageURL (show-cover fallback), kind.
 *
 * Bruger Firebase Admin credentials (samme som resten af appen) — kræver IKKE firebase CLI-login.
 * Opdaterer også podcasts/feed.xml spejlet.
 *
 * Usage:
 *   node scripts/backfill-podcast-manifest.mjs
 *   node scripts/backfill-podcast-manifest.mjs --dry-run
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');

try {
  process.loadEnvFile?.(resolve(root, '.env.local'));
} catch {
  /* ignore */
}
try {
  process.loadEnvFile?.(resolve(root, '.env'));
} catch {
  /* ignore */
}

const DRY = process.argv.includes('--dry-run');
const MANIFEST_PATH = 'podcasts/manifest.json';
const FEED_PATH = 'podcasts/feed.xml';
const SHOW_COVER_URL =
  process.env.PODCAST_SHOW_COVER_URL || 'https://ai.aproposmagazine.com/podcast/show-cover.jpg';
const RSS_FEED_URL =
  process.env.PODCAST_RSS_FEED_URL || 'https://ai.aproposmagazine.com/api/podcast/rss';
const SHOW_TITLE = 'Lyt til Apropos Magazine';
const SHOW_LINK = 'https://www.aproposmagazine.com';
const SHOW_DESCRIPTION =
  'Lyt til Apropos Magazines artikler — kultur, film, musik og mere. Hver episode er en artikel fra aproposmagazine.com, oplæst med AI, så du kan følge med på øret, når du ikke har tid til at læse.';
const SHOW_OWNER_NAME = 'Liv';
const SHOW_OWNER_EMAIL = 'liv@aproposmagazine.com';

function bucketName() {
  return (
    process.env.PODCAST_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    process.env.FIREBASE_ADMIN_STORAGE_BUCKET ||
    `${process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.appspot.com`
  );
}

function initAdmin() {
  const admin = require('firebase-admin');
  if (admin.apps.length) return admin;
  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (privateKey?.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Mangler FIREBASE_ADMIN_* credentials');
  }
  admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
  return admin;
}

function storagePathFromUrl(url) {
  const m = String(url).match(/\/o\/([^?]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

function slugToId(slug) {
  const compact = String(slug).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return compact || slug;
}

function extractToken(metadata) {
  const raw = metadata?.metadata?.firebaseStorageDownloadTokens;
  if (!raw) return null;
  return String(raw).split(',')[0].trim() || null;
}

function escapeXml(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
function cdata(v) {
  return `<![CDATA[${String(v || '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}
function fmtDur(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

function buildRss(episodes) {
  const items = episodes
    .map((ep) => {
      const link = ep.articleUrl || `https://www.aproposmagazine.com/articles/${ep.articleSlug}`;
      const guid = ep.guid || ep.id || ep.articleSlug;
      const image = ep.imageURL || SHOW_COVER_URL;
      const author = (ep.hosts || []).join(', ') || SHOW_TITLE;
      const desc = ep.description || `${ep.title}. Lyt til artiklen — Apropos Magazine.`;
      const length = ep.audioBytes > 0 ? String(ep.audioBytes) : '0';
      const dur = ep.durationSeconds > 0 ? fmtDur(ep.durationSeconds) : null;
      const lines = [
        '    <item>',
        `      <title>${escapeXml(ep.title)}</title>`,
        `      <description>${cdata(desc)}</description>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="false">${escapeXml(guid)}</guid>`,
        `      <pubDate>${new Date(ep.publishedAt).toUTCString()}</pubDate>`,
        `      <enclosure url="${escapeXml(ep.audioURL)}" length="${length}" type="audio/mp4" />`,
        `      <itunes:author>${escapeXml(author)}</itunes:author>`,
        `      <itunes:summary>${cdata(desc)}</itunes:summary>`,
        `      <itunes:explicit>false</itunes:explicit>`,
        `      <itunes:image href="${escapeXml(image)}" />`,
        `      <itunes:episodeType>full</itunes:episodeType>`,
      ];
      if (dur) lines.push(`      <itunes:duration>${dur}</itunes:duration>`);
      lines.push('    </item>');
      return lines.join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SHOW_TITLE)}</title>
    <link>${escapeXml(SHOW_LINK)}</link>
    <description>${cdata(SHOW_DESCRIPTION)}</description>
    <language>da-dk</language>
    <atom:link href="${escapeXml(RSS_FEED_URL)}" rel="self" type="application/rss+xml" />
    <itunes:author>${escapeXml(SHOW_TITLE)}</itunes:author>
    <itunes:summary>${cdata(SHOW_DESCRIPTION)}</itunes:summary>
    <itunes:type>episodic</itunes:type>
    <itunes:owner>
      <itunes:name>${escapeXml(SHOW_OWNER_NAME)}</itunes:name>
      <itunes:email>${escapeXml(SHOW_OWNER_EMAIL)}</itunes:email>
    </itunes:owner>
    <itunes:explicit>false</itunes:explicit>
    <itunes:category text="Arts" />
    <itunes:image href="${escapeXml(SHOW_COVER_URL)}" />
    <image>
      <url>${escapeXml(SHOW_COVER_URL)}</url>
      <title>${escapeXml(SHOW_TITLE)}</title>
      <link>${escapeXml(SHOW_LINK)}</link>
    </image>
${items}
  </channel>
</rss>
`;
}

const admin = initAdmin();
const bucket = admin.storage().bucket(bucketName());

const manifestFile = bucket.file(MANIFEST_PATH);
const [buf] = await manifestFile.download();
const manifest = JSON.parse(buf.toString('utf8'));
const episodes = Array.isArray(manifest.episodes) ? manifest.episodes : [];

let enriched = 0;
for (const ep of episodes) {
  if (!ep.guid) ep.guid = ep.id || slugToId(ep.articleSlug);
  if (!ep.imageURL) ep.imageURL = SHOW_COVER_URL;
  if (!ep.kind) ep.kind = String(ep.id || '').startsWith('ai-') ? 'ai' : 'human';

  if (!(ep.audioBytes > 0)) {
    const path = storagePathFromUrl(ep.audioURL);
    if (path) {
      try {
        const [meta] = await bucket.file(path).getMetadata();
        const size = Number(meta.size) || 0;
        if (size > 0) {
          ep.audioBytes = size;
          enriched++;
        }
      } catch (e) {
        console.warn(`size lookup failed for ${ep.articleSlug}: ${e.message}`);
      }
    }
  }
}

console.log(`Episodes: ${episodes.length}, audioBytes backfilled: ${enriched}`);

if (DRY) {
  console.log('[dry-run] no writes');
  process.exit(0);
}

manifest.updatedAt = new Date().toISOString();
let manifestToken = extractToken((await manifestFile.getMetadata())[0]) || randomUUID();
await manifestFile.save(JSON.stringify(manifest, null, 2), {
  resumable: false,
  metadata: {
    contentType: 'application/json',
    cacheControl: 'public, max-age=300',
    metadata: { firebaseStorageDownloadTokens: manifestToken },
  },
});
console.log('manifest.json updated');

const feedFile = bucket.file(FEED_PATH);
let feedToken;
try {
  feedToken = extractToken((await feedFile.getMetadata())[0]);
} catch {
  feedToken = null;
}
if (!feedToken) feedToken = randomUUID();
await feedFile.save(buildRss(episodes), {
  resumable: false,
  metadata: {
    contentType: 'application/rss+xml; charset=utf-8',
    cacheControl: 'public, max-age=300',
    metadata: { firebaseStorageDownloadTokens: feedToken },
  },
});
console.log('feed.xml mirror updated');
