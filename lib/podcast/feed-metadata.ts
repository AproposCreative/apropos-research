import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { getWebflowConfig } from '@/lib/webflow-config';
import { env } from '@/lib/config/env';
import { slugToManifestId } from './manifest-format';
import { podcastEpisodeGuid, selectPodcastRssEpisodes } from './rss-episodes';
import { storePodcastArtwork } from './feed-artwork';
import { matchPodcastArticle, podcastMetadataKey, podcastSourceHash, publishedPodcastArticle,
  type PodcastFeedMetadata, type PodcastFeedMetadataMap, type PublishedPodcastArticle } from './feed-metadata-format';
import type { PodcastManifest } from './types';
import { PODCAST_ARTWORK_STYLE } from './artwork-style';

const COLLECTION = 'podcastFeedMetadata';
function database() { const db = getAdminDb(); if (!db) throw Error('podcast_metadata_storage_unavailable'); return db; }

export async function readPodcastFeedMetadata(manifest: PodcastManifest): Promise<PodcastFeedMetadataMap> {
  const db = database(), episodes = selectPodcastRssEpisodes(manifest.episodes);
  if (!episodes.length) return {};
  const docs = await db.getAll(...episodes.map(ep => db.collection(COLLECTION).doc(podcastMetadataKey(podcastEpisodeGuid(ep)))));
  const result: PodcastFeedMetadataMap = {};
  for (const doc of docs) {
    const data = doc.data() as PodcastFeedMetadata | undefined;
    if (data?.guid && data.imageURL && data.artworkSha256) result[data.guid] = data;
  }
  return result;
}

export async function fetchPublishedPodcastArticles(): Promise<PublishedPodcastArticle[]> {
  const cfg = getWebflowConfig(), token = cfg.apiToken || env.WEBFLOW_API_TOKEN;
  const collection = cfg.articlesCollectionId || env.WEBFLOW_ARTICLES_COLLECTION_ID;
  if (!token || !collection) throw Error('podcast_live_cms_unavailable');
  const items: PublishedPodcastArticle[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const response = await fetch(`https://api.webflow.com/v2/collections/${collection}/items/live?limit=100&offset=${offset}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw Error(`podcast_live_cms_http_${response.status}`);
    const body = await response.json() as { items?: Record<string, unknown>[] };
    if (!Array.isArray(body.items)) throw Error('podcast_live_cms_invalid');
    items.push(...body.items.map(publishedPodcastArticle).filter((a): a is PublishedPodcastArticle => a !== null));
    if (body.items.length < 100) return items;
  }
  throw Error('podcast_live_cms_pagination_limit');
}

/** Bounded, resumable, metadata-only synchronization. Never writes manifest, CMS or audio. */
export async function syncPodcastFeedMetadata(manifest: PodcastManifest, limit = 20) {
  const db = database(), lock = db.collection('podcastFeedOperations').doc('metadata-sync'), lease = randomUUID();
  const acquired = await db.runTransaction(async tx => {
    const old = (await tx.get(lock)).data();
    if (Number(old?.leaseUntil) > Date.now()) return false;
    tx.set(lock, { lease, leaseUntil: Date.now() + 240_000 }); return true;
  });
  if (!acquired) return { busy: true, updated: [], failed: [], unmatched: [], remaining: null };
  try {
    // Do not discard last good records when Webflow or a new cover is unavailable.
    const [articles, previous] = await Promise.all([fetchPublishedPodcastArticles(), readPodcastFeedMetadata(manifest)]);
    const unmatched: string[] = [], updated: string[] = [], failed: Array<{ guid: string; reason: string }> = [];
    const candidates = selectPodcastRssEpisodes(manifest.episodes).flatMap(episode => {
      const guid = podcastEpisodeGuid(episode), prior = previous[guid];
      const boundCmsId = prior?.articleIdentity === slugToManifestId(episode.articleSlug) ? prior.id : undefined;
      const article = matchPodcastArticle(episode.articleSlug, articles, episode.title, boundCmsId);
      if (!article) { unmatched.push(guid); return []; }
      const sourceHash = podcastSourceHash(article);
      return previous[guid]?.sourceHash === sourceHash && previous[guid]?.artworkStyle === PODCAST_ARTWORK_STYLE ? [] : [{ episode, guid, article, sourceHash }];
    });
    const batch = candidates.slice(0, Math.min(20, Math.max(1, limit)));
    // Small concurrency bounds memory, bandwidth and the server request duration.
    for (let i = 0; i < batch.length; i += 2) await Promise.all(batch.slice(i, i + 2).map(async ({ episode, guid, article, sourceHash }) => {
      try {
        if (!article.coverUrl) throw Error('podcast_published_cover_missing');
        const prior = previous[guid];
        const artwork = prior?.coverUrl === article.coverUrl && prior.artworkStyle === PODCAST_ARTWORK_STYLE ? {
          imageURL: prior.imageURL, artworkSha256: prior.artworkSha256, artworkBytes: prior.artworkBytes,
        } : await storePodcastArtwork(article.coverUrl);
        const metadata: PodcastFeedMetadata = { ...article, ...artwork, artworkStyle: PODCAST_ARTWORK_STYLE, guid, sourceHash,
          articleIdentity: slugToManifestId(episode.articleSlug), updatedAt: new Date().toISOString() };
        await db.runTransaction(async tx => {
          const current = (await tx.get(lock)).data();
          if (current?.lease !== lease || Number(current.leaseUntil) <= Date.now()) throw Error('podcast_metadata_lease_expired');
          tx.set(db.collection(COLLECTION).doc(podcastMetadataKey(guid)), metadata);
        });
        updated.push(guid);
      } catch (error) {
        // No raw error body, URLs, credentials or stack in operational receipts.
        const reason = error instanceof Error && /^podcast_[a-z_]+$/.test(error.message) ? error.message : 'podcast_artwork_processing_failed';
        failed.push({ guid, reason });
      }
    }));
    return { busy: false, complete: unmatched.length === 0 && candidates.length === updated.length,
      total: selectPodcastRssEpisodes(manifest.episodes).length, matched: selectPodcastRssEpisodes(manifest.episodes).length - unmatched.length,
      updated, failed, unmatched, remaining: candidates.length - updated.length, checkedAt: new Date().toISOString() };
  } finally {
    await db.runTransaction(async tx => {
      if ((await tx.get(lock)).data()?.lease === lease) tx.delete(lock);
    });
  }
}
