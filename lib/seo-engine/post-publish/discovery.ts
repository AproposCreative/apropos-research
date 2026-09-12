import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { resolveAutoOpportunityOptimizationEnabled } from '@/lib/seo-engine/opportunity-engine/settings';
import { cmsLocaleIdFor } from '@/lib/seo-engine/opportunity-engine/locale';
import { getCmsSeoSlugs } from '@/lib/seo-engine/webflow-adapter';
import { stripHtmlToText } from '@/lib/seo-engine/html-text';
import { listPublishedArticlePage } from './cms';
import { publishedSnapshot, type CmsSnapshot } from './snapshot';
import { enqueueQualityJob } from './jobs';

export type DiscoveryCursor = { locale: 'da' | 'en'; offset: number };
export function nextDiscoveryCursor(current: DiscoveryCursor, count: number, total: number): DiscoveryCursor {
  if (count === 0 || current.offset + count >= total) return { locale: current.locale === 'da' ? 'en' : 'da', offset: 0 };
  return { ...current, offset: current.offset + count };
}

export async function queueDiscoveredArticle(item: CmsSnapshot, locale: 'da' | 'en') {
  // Discovery does not write CMS. The worker MUST fetch actual live AND staged
  // state before any model call and again under the CMS lease before writing.
  const snapshot = publishedSnapshot({ itemId: item.id, cmsLocaleId: cmsLocaleIdFor(locale), locale,
    live: item, staged: item, slugs: getCmsSeoSlugs() });
  const fd = item.fieldData;
  return enqueueQualityJob({ source: 'recovery', mode: 'publication_quality', snapshot, article: {
    editorialTitle: String(fd.name || ''), locale, metadata: snapshot.metadata,
    body: stripHtmlToText([fd.subtitle, fd.intro, fd.content].filter(Boolean).join('\n\n')),
    ...(typeof fd['article-type'] === 'string' ? { articleType: fd['article-type'] } : {}),
    ...(typeof fd.stjerne === 'number' ? { rating: fd.stjerne } : {}),
  } });
}

/** One durable page per cron. Repeated full sweeps cover missed publish events. */
export async function discoverPublishedQualityJobs() {
  if (!(await resolveAutoOpportunityOptimizationEnabled())) return { skipped: true, reason: 'auto_disabled' };
  const db = getAdminDb();
  if (!db) throw new Error('seo_firestore_unavailable');
  const ref = db.collection('seoPostPublishControl').doc('discovery');
  const owner = randomUUID();
  const cursor = await db.runTransaction(async tx => {
    const state = (await tx.get(ref)).data();
    if (Number(state?.leaseUntil || 0) > Date.now()) return null;
    const cursor: DiscoveryCursor = { locale: state?.locale === 'en' ? 'en' : 'da',
      offset: Number.isInteger(state?.offset) && state!.offset >= 0 ? state!.offset : 0 };
    tx.set(ref, { ...cursor, owner, leaseUntil: Date.now() + 5 * 60_000 }, { merge: true });
    return cursor;
  });
  if (!cursor) return { skipped: true, reason: 'discovery_busy' };
  try {
    const page = await listPublishedArticlePage(cursor.locale, cursor.offset, 50);
    // Small batches bound Firestore load. Never advance past a failed enqueue.
    for (let start = 0; start < page.items.length; start += 5) {
      const results = await Promise.allSettled(page.items.slice(start, start + 5).map(item => queueDiscoveredArticle(item, cursor.locale)));
      const failure = results.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    }
    const next = nextDiscoveryCursor(cursor, page.items.length, page.total);
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).data()?.owner !== owner) throw new Error('seo_discovery_lease_lost');
      tx.set(ref, { ...next, owner, leaseUntil: 0, checkedAt: new Date().toISOString(), lastError: null });
    });
    return { skipped: false, inspected: page.items.length, locale: cursor.locale, next };
  } catch (error) {
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).data()?.owner !== owner) return;
      tx.update(ref, { leaseUntil: 0, lastError: error instanceof Error ? error.message : 'discovery_failed' });
    });
    throw error;
  }
}
