#!/usr/bin/env node
/**
 * Backfill Webflow CMS Switch `lydversion` = true for alle episoder i podcasts/manifest.json.
 *
 * Usage:
 *   node scripts/backfill-webflow-lydversion.mjs
 *   node scripts/backfill-webflow-lydversion.mjs --dry-run
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

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
const FIELD = 'lydversion';
const MANIFEST_PATH = 'podcasts/manifest.json';

const DK = process.env.WEBFLOW_CMS_LOCALE_DK || '67dbf17ba540975b5b21c225';
const EN = process.env.WEBFLOW_CMS_LOCALE_EN || '690ca0f6b0d13d8788354156';

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

function webflowRuntime() {
  const token = process.env.WEBFLOW_API_TOKEN?.trim();
  const collectionId = process.env.WEBFLOW_ARTICLES_COLLECTION_ID?.trim();
  if (!token || !collectionId) throw new Error('Mangler WEBFLOW_API_TOKEN / WEBFLOW_ARTICLES_COLLECTION_ID');
  return { token, collectionId };
}

async function buildSlugIndex(rt) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const cmsLocaleId of [DK, EN, null]) {
    const pageSize = 100;
    let offset = 0;
    while (offset < 5000) {
      const qs = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
      if (cmsLocaleId) qs.set('cmsLocaleId', cmsLocaleId);
      const res = await fetch(`https://api.webflow.com/v2/collections/${rt.collectionId}/items?${qs}`, {
        headers: { Authorization: `Bearer ${rt.token}`, 'Accept-Version': '1.0.0' },
      });
      if (!res.ok) throw new Error(`Webflow list ${res.status}`);
      const data = await res.json();
      const page = data.items || [];
      for (const it of page) {
        const slug = String(it.fieldData?.slug || '').trim();
        if (slug && it.id && !map.has(slug)) map.set(slug, String(it.id));
      }
      if (page.length < pageSize) break;
      offset += pageSize;
      await sleep(80);
    }
  }
  return map;
}

async function fetchLocale(rt, itemId, cmsLocaleId) {
  const qs = new URLSearchParams({ cmsLocaleId });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(
      `https://api.webflow.com/v2/collections/${rt.collectionId}/items/${itemId}?${qs}`,
      { headers: { Authorization: `Bearer ${rt.token}`, 'Accept-Version': '1.0.0' } }
    );
    if (res.status === 404) return null;
    if (res.status === 429) {
      const wait = Math.min(8000, 800 * 2 ** attempt);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`Webflow get ${res.status}`);
    return res.json();
  }
  throw new Error('Webflow get 429');
}

async function patchAndMaybePublish(rt, itemId, cmsLocaleId, item) {
  if (item.fieldData?.[FIELD] === true) return 'already';
  if (DRY) return 'would-set';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const patchRes = await fetch(`https://api.webflow.com/v2/collections/${rt.collectionId}/items`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${rt.token}`,
        'Accept-Version': '1.0.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items: [{ id: itemId, cmsLocaleId, fieldData: { [FIELD]: true } }] }),
    });
    if (patchRes.status === 429) {
      await sleep(Math.min(8000, 800 * 2 ** attempt));
      continue;
    }
    if (!patchRes.ok) {
      const j = await patchRes.json().catch(() => ({}));
      throw new Error(j.message || `patch ${patchRes.status}`);
    }

    const isLive = item.isDraft !== true && Boolean(item.lastPublished);
    if (isLive) {
      for (let p = 0; p < 5; p += 1) {
        const pubRes = await fetch(
          `https://api.webflow.com/v2/collections/${rt.collectionId}/items/publish`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${rt.token}`,
              'Accept-Version': '1.0.0',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ items: [{ id: itemId, cmsLocaleIds: [cmsLocaleId] }] }),
          }
        );
        if (pubRes.status === 429) {
          await sleep(Math.min(8000, 800 * 2 ** p));
          continue;
        }
        if (!pubRes.ok) {
          const j = await pubRes.json().catch(() => ({}));
          throw new Error(j.message || `publish ${pubRes.status}`);
        }
        return 'set+published';
      }
      throw new Error('publish 429');
    }
    return 'set-draft';
  }
  throw new Error('patch 429');
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const admin = initAdmin();
  const rt = webflowRuntime();
  const bucket = admin.storage().bucket(bucketName());
  const file = bucket.file(MANIFEST_PATH);
  const [exists] = await file.exists();
  if (!exists) throw new Error('manifest.json findes ikke');
  const [buf] = await file.download();
  const manifest = JSON.parse(buf.toString('utf8'));
  const episodes = Array.isArray(manifest.episodes) ? manifest.episodes : [];
  console.log(`Episodes: ${episodes.length}${DRY ? ' (dry-run)' : ''}`);
  console.log('Building Webflow slug index…');
  const slugIndex = await buildSlugIndex(rt);
  console.log(`Indexed ${slugIndex.size} article slugs`);

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const ep of episodes) {
    const slug = String(ep.articleSlug || '').trim();
    if (!slug) {
      skip += 1;
      continue;
    }
    try {
      const itemId = slugIndex.get(slug) || null;
      if (!itemId) {
        console.log(`MISS  ${slug}`);
        skip += 1;
        continue;
      }
      const results = [];
      for (const locale of [DK, EN]) {
        const item = await fetchLocale(rt, itemId, locale);
        if (!item) continue;
        const status = await patchAndMaybePublish(rt, itemId, locale, item);
        results.push(`${locale.slice(0, 6)}:${status}`);
        await sleep(250);
      }
      console.log(`OK    ${slug}  ${itemId}  ${results.join(', ') || 'no-locales'}`);
      ok += 1;
    } catch (err) {
      fail += 1;
      console.error(`FAIL  ${slug}`, err instanceof Error ? err.message : err);
      await sleep(400);
    }
  }

  console.log(`Done. ok=${ok} skip=${skip} fail=${fail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
