import { randomUUID } from 'crypto';
import { getBucket } from './firebase.js';

const MANIFEST_PATH = 'podcasts/manifest.json';
const DEFAULT_MANIFEST_TOKEN = '2e7823c1-fc8f-4a77-bfe2-667acbb3ad40';

function slugToId(slug) {
  const compact = slug.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return compact || slug;
}

function extractToken(metadata) {
  const raw = metadata?.metadata?.firebaseStorageDownloadTokens;
  if (!raw) return null;
  return String(raw).split(',')[0].trim() || null;
}

export async function readManifest() {
  const bucket = getBucket();
  const file = bucket.file(MANIFEST_PATH);
  const [exists] = await file.exists();
  if (!exists) return { version: 1, updatedAt: new Date().toISOString(), episodes: [] };

  const [buf] = await file.download();
  try {
    const parsed = JSON.parse(buf.toString('utf8'));
    return {
      version: parsed.version || 1,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      episodes: Array.isArray(parsed.episodes) ? parsed.episodes : [],
    };
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), episodes: [] };
  }
}

async function saveManifest(manifest) {
  const bucket = getBucket();
  const file = bucket.file(MANIFEST_PATH);
  let token = DEFAULT_MANIFEST_TOKEN;
  try {
    const [meta] = await file.getMetadata();
    token = extractToken(meta) || token;
  } catch {
    /* ignore */
  }

  const payload = {
    version: manifest.version,
    updatedAt: manifest.updatedAt,
    episodes: manifest.episodes,
  };

  await file.save(JSON.stringify(payload, null, 2), {
    resumable: false,
    metadata: {
      contentType: 'application/json',
      cacheControl: 'public, max-age=300',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
}

export async function upsertEpisode({ slug, title, articleUrl, audioUrl, hosts }) {
  const manifest = await readManifest();
  const publishedAt = new Date().toISOString();
  const entry = {
    id: slugToId(slug),
    articleSlug: slug,
    title,
    subtitle: 'Lyt til artiklen',
    audioURL: audioUrl,
    hosts: hosts?.length ? hosts : ['Apropos Magazine'],
    publishedAt,
  };
  const next = manifest.episodes.filter((e) => (e.articleSlug || e.slug) !== slug);
  next.push(entry);
  next.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  manifest.episodes = next;
  manifest.updatedAt = publishedAt;

  await saveManifest(manifest);
}

export async function uploadPublishedAudio(slug, buffer) {
  const bucket = getBucket();
  const bucketName = bucket.name;
  const path = `podcasts/articles/${slug}/audio.m4a`;
  const downloadToken = randomUUID();

  await bucket.file(path).save(buffer, {
    resumable: false,
    metadata: {
      contentType: 'audio/mp4',
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  });

  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;
}
