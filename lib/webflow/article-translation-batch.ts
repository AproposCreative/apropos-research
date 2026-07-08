/**
 * Scan + batch-kørsel af DK→EN artikeloversættelse fra indstillinger.
 */

import { computeTranslationSourceHash } from '@/lib/articles/translation-source-hash';
import { getAdminDb } from '@/lib/firebase-admin';
import { runArticleTranslation } from '@/lib/webflow/article-translation';
import { isWebflowLocalePublished, resolveWebflowLocaleIds } from '@/lib/webflow/locale-items';

export type TranslationCandidateStatus =
  | 'ready'
  | 'skip-unchanged'
  | 'skip-no-en'
  | 'skip-dk-unpublished'
  | 'in-progress';

export type TranslationCandidate = {
  id: string;
  title: string;
  slug: string;
  status: TranslationCandidateStatus;
};

export type TranslationBatchRunResult = TranslationCandidate & {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  enName?: string;
  error?: string;
};

const STATE_COLLECTION = 'articleTranslationState';

async function fetchArticleIdsForLocale(cmsLocaleId: string): Promise<Set<string>> {
  const { getWebflowConfig } = await import('@/lib/webflow-config');
  const { env } = await import('@/lib/config/env');
  const file = getWebflowConfig();
  const token = (file.apiToken !== undefined ? file.apiToken : env.WEBFLOW_API_TOKEN) || undefined;
  const collectionId =
    (file.articlesCollectionId !== undefined ? file.articlesCollectionId : env.WEBFLOW_ARTICLES_COLLECTION_ID) ||
    undefined;
  if (!token || !collectionId) {
    throw new Error('Manglende Webflow API token eller Articles Collection ID');
  }

  const headers = { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' } as const;
  const pageSize = 100;
  let offset = 0;
  const ids = new Set<string>();

  while (offset < 5000) {
    const url = `https://api.webflow.com/v2/collections/${collectionId}/items?cmsLocaleId=${cmsLocaleId}&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.message || `Webflow items error ${res.status}`);
    }
    const data: { items?: Array<{ id?: string }> } = await res.json();
    const page = data.items || [];
    for (const item of page) {
      if (item?.id) ids.add(item.id);
    }
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return ids;
}

async function fetchDkArticleItems(): Promise<
  Array<{
    id: string;
    fieldData: Record<string, unknown>;
    lastPublished?: string | null;
    isDraft?: boolean;
  }>
> {
  const { getWebflowConfig } = await import('@/lib/webflow-config');
  const { env } = await import('@/lib/config/env');
  const file = getWebflowConfig();
  const token = (file.apiToken !== undefined ? file.apiToken : env.WEBFLOW_API_TOKEN) || undefined;
  const collectionId =
    (file.articlesCollectionId !== undefined ? file.articlesCollectionId : env.WEBFLOW_ARTICLES_COLLECTION_ID) ||
    undefined;
  const dkLocale = env.WEBFLOW_CMS_LOCALE_DK;
  if (!token || !collectionId) {
    throw new Error('Manglende Webflow API token eller Articles Collection ID');
  }

  const headers = { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' } as const;
  const pageSize = 100;
  let offset = 0;
  const items: Array<{
    id: string;
    fieldData: Record<string, unknown>;
    lastPublished?: string | null;
    isDraft?: boolean;
  }> = [];

  while (offset < 5000) {
    const url = `https://api.webflow.com/v2/collections/${collectionId}/items?cmsLocaleId=${dkLocale}&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.message || `Webflow items error ${res.status}`);
    }
    const data: {
      items?: Array<{
        id?: string;
        fieldData?: Record<string, unknown>;
        lastPublished?: string | null;
        isDraft?: boolean;
      }>;
    } = await res.json();
    const page = data.items || [];
    for (const item of page) {
      if (item?.id) {
        items.push({
          id: item.id,
          fieldData: (item.fieldData || {}) as Record<string, unknown>,
          lastPublished: item.lastPublished ?? null,
          isDraft: item.isDraft,
        });
      }
    }
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return items;
}

async function getTranslationStateMap(
  itemIds: string[]
): Promise<Map<string, { sourceHash?: string; inProgress?: boolean }>> {
  const map = new Map<string, { sourceHash?: string; inProgress?: boolean }>();
  const db = getAdminDb();
  if (!db || itemIds.length === 0) return map;

  const chunkSize = 30;
  for (let i = 0; i < itemIds.length; i += chunkSize) {
    const chunk = itemIds.slice(i, i + chunkSize);
    const snaps = await Promise.all(
      chunk.map((id) => db.collection(STATE_COLLECTION).doc(id).get())
    );
    snaps.forEach((snap, idx) => {
      if (snap.exists) {
        const data = snap.data() as { sourceHash?: string; inProgress?: boolean };
        map.set(chunk[idx], data);
      }
    });
  }
  return map;
}

async function buildCandidates(options: { force?: boolean }): Promise<TranslationCandidate[]> {
  const locales = resolveWebflowLocaleIds();
  const [items, enIds] = await Promise.all([
    fetchDkArticleItems(),
    fetchArticleIdsForLocale(locales.en),
  ]);
  const stateMap = await getTranslationStateMap(items.map((i) => i.id));
  const candidates: TranslationCandidate[] = [];

  for (const item of items) {
    const fd = item.fieldData;
    const title =
      typeof fd.name === 'string' && fd.name.trim() ? fd.name.trim() : item.id;
    const slug = typeof fd.slug === 'string' ? fd.slug : '';

    if (!enIds.has(item.id)) {
      candidates.push({ id: item.id, title, slug, status: 'skip-no-en' });
      continue;
    }

    if (!isWebflowLocalePublished(item)) {
      candidates.push({ id: item.id, title, slug, status: 'skip-dk-unpublished' });
      continue;
    }

    const state = stateMap.get(item.id);
    if (state?.inProgress) {
      candidates.push({ id: item.id, title, slug, status: 'in-progress' });
      continue;
    }

    const sourceHash = computeTranslationSourceHash(fd);
    if (!options.force && state?.sourceHash === sourceHash) {
      candidates.push({ id: item.id, title, slug, status: 'skip-unchanged' });
      continue;
    }

    candidates.push({ id: item.id, title, slug, status: 'ready' });
  }

  return candidates;
}

export async function previewArticleTranslationBatch(options: {
  force?: boolean;
  limit?: number;
} = {}): Promise<{
  total: number;
  ready: number;
  skipNoEn: number;
  skipDkUnpublished: number;
  skipUnchanged: number;
  totalCandidates: number;
  results: TranslationCandidate[];
  candidates: TranslationCandidate[];
}> {
  const limit = Math.min(Math.max(Math.round(options.limit ?? 50), 1), 200);
  const all = await buildCandidates({ force: options.force });
  const readyList = all.filter((c) => c.status === 'ready');

  return {
    total: all.length,
    ready: readyList.length,
    skipNoEn: all.filter((c) => c.status === 'skip-no-en').length,
    skipDkUnpublished: all.filter((c) => c.status === 'skip-dk-unpublished').length,
    skipUnchanged: all.filter((c) => c.status === 'skip-unchanged').length,
    totalCandidates: readyList.length,
    results: all.slice(0, limit),
    candidates: readyList.slice(0, limit),
  };
}

export async function runArticleTranslationBatch(options: {
  force?: boolean;
  articleLimit?: number;
} = {}): Promise<{
  total: number;
  ready: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  skippedReason: string | null;
  results: TranslationBatchRunResult[];
}> {
  const articleLimit = Math.min(Math.max(Math.round(options.articleLimit ?? 3), 1), 10);
  const preview = await previewArticleTranslationBatch({ force: options.force, limit: 500 });
  const queue = preview.candidates.slice(0, articleLimit);

  if (queue.length === 0) {
    return {
      total: preview.total,
      ready: preview.ready,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      skippedReason:
        preview.ready === 0
          ? 'Ingen artikler mangler oversættelse lige nu.'
          : null,
      results: [],
    };
  }

  const results: TranslationBatchRunResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const candidate of queue) {
    try {
      const r = await runArticleTranslation(candidate.id, {
        source: 'settings-batch',
        force: options.force,
      });
      if (r.skipped) {
        skipped += 1;
        results.push({
          ...candidate,
          ok: false,
          skipped: true,
          reason: r.reason,
        });
      } else {
        succeeded += 1;
        results.push({
          ...candidate,
          ok: true,
          enName: r.enName,
        });
      }
    } catch (e) {
      failed += 1;
      results.push({
        ...candidate,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    total: preview.total,
    ready: preview.ready,
    processed: queue.length,
    succeeded,
    failed,
    skipped,
    skippedReason: null,
    results,
  };
}
