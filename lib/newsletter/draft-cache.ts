import { FieldValue, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import type { WeekRange } from '@/lib/newsletter/week-range';
import type { NewsletterArticle } from '@/lib/newsletter/webflow-sources';
import type { BuildDraftResult } from '@/lib/newsletter/build-draft';
import { getAdminDb } from '@/lib/firebase-admin';

const DRAFT_CACHE_COLLECTION = 'newsletterDraftCache';
const CACHE_DOC_PREFIX = 'weekly-';
const DRAFT_TEMPLATE_VERSION = 22;

export type DraftCacheHit = {
  hit: true;
  draft: BuildDraftResult;
  generatedAt: string | null;
};

export type DraftCacheMiss = { hit: false };

function storedTemplateVersion(d: Record<string, unknown>): number {
  const v = d.templateVersion;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Uden matchende skabelon-version: ikke brug cache til preview (undgår gammelt logo/layout). */
function isStaleCacheDoc(d: Record<string, unknown>): boolean {
  return storedTemplateVersion(d) !== DRAFT_TEMPLATE_VERSION;
}

function cacheDocId(week: WeekRange): string {
  return `${CACHE_DOC_PREFIX}${week.start.toISOString().slice(0, 10)}`;
}

function parseCachedDraftData(
  d: Record<string, unknown>,
  fallbackWeek: WeekRange
): DraftCacheHit | DraftCacheMiss {
  const weekStart = typeof d.weekStart === 'string' ? d.weekStart : fallbackWeek.start.toISOString();
  const weekEnd = typeof d.weekEnd === 'string' ? d.weekEnd : fallbackWeek.end.toISOString();
  const labelDa = typeof d.weekLabelDa === 'string' ? d.weekLabelDa : fallbackWeek.labelDa;
  const isoWeek =
    typeof d.weekIsoWeek === 'number' && Number.isFinite(d.weekIsoWeek)
      ? d.weekIsoWeek
      : fallbackWeek.isoWeek;
  const subject = typeof d.subject === 'string' ? d.subject : '';
  const html = typeof d.html === 'string' ? d.html : '';
  const headline = typeof d.headline === 'string' ? d.headline : '';
  const intro = typeof d.intro === 'string' ? d.intro : '';
  const warnings = Array.isArray(d.warnings) ? d.warnings.filter((w) => typeof w === 'string') : [];
  const articles = Array.isArray(d.articles)
    ? d.articles
        .filter((a) => a && typeof a === 'object')
        .map((a) => {
          const row = a as Record<string, unknown>;
          return {
            id: String(row.id ?? ''),
            title: String(row.title ?? ''),
            slug: String(row.slug ?? ''),
            excerpt: String(row.excerpt ?? ''),
            thumbUrl: typeof row.thumbUrl === 'string' ? row.thumbUrl : null,
            lastPublished: String(row.lastPublished ?? ''),
            url: String(row.url ?? ''),
            subtitle: typeof row.subtitle === 'string' ? row.subtitle : null,
            ratingStars:
              typeof row.ratingStars === 'number' && Number.isFinite(row.ratingStars)
                ? row.ratingStars
                : null,
            metaCategoryLine: typeof row.metaCategoryLine === 'string' ? row.metaCategoryLine : null,
            authorItemId: typeof row.authorItemId === 'string' ? row.authorItemId : null,
            authorName: typeof row.authorName === 'string' ? row.authorName : null,
          };
        })
    : [];
  if (!subject || !html || !headline) return { hit: false };
  if (isStaleCacheDoc(d)) return { hit: false };

  const generatedAtTs = d.generatedAt as Timestamp | undefined;
  return {
    hit: true,
    generatedAt: generatedAtTs ? generatedAtTs.toDate().toISOString() : null,
    draft: {
      week: {
        start: new Date(weekStart),
        end: new Date(weekEnd),
        labelDa,
        isoWeek,
      },
      subject,
      html,
      headline,
      intro,
      articles,
      warnings,
    },
  };
}

export function buildWeeklyDraftInputHash(params: {
  week: WeekRange;
  articles: NewsletterArticle[];
  introOverride?: string;
  skipAiIntro?: boolean;
  logoAssetBaseUrl?: string;
}): string {
  const payload = {
    templateVersion: DRAFT_TEMPLATE_VERSION,
    weekStart: params.week.start.toISOString(),
    weekEnd: params.week.end.toISOString(),
    introOverride: (params.introOverride || '').trim(),
    skipAiIntro: Boolean(params.skipAiIntro),
    logoAssetBaseUrl: (params.logoAssetBaseUrl || '').trim(),
    articles: params.articles.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      excerpt: a.excerpt,
      thumbUrl: a.thumbUrl || '',
      lastPublished: a.lastPublished,
      url: a.url,
      subtitle: a.subtitle ?? null,
      ratingStars: a.ratingStars ?? null,
      metaCategoryLine: a.metaCategoryLine ?? null,
    })),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function readWeeklyDraftCache(
  week: WeekRange,
  inputHash: string
): Promise<DraftCacheHit | DraftCacheMiss> {
  const db = getAdminDb();
  if (!db) return { hit: false };

  try {
    const ref = db.collection(DRAFT_CACHE_COLLECTION).doc(cacheDocId(week));
    const snap = await ref.get();
    if (!snap.exists) return { hit: false };
    const d = snap.data() as Record<string, unknown>;
    if (typeof d.inputHash !== 'string' || d.inputHash !== inputHash) return { hit: false };
    return parseCachedDraftData(d, week);
  } catch {
    return { hit: false };
  }
}

export async function saveWeeklyDraftCache(
  draft: BuildDraftResult,
  inputHash: string
): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  const ref = db.collection(DRAFT_CACHE_COLLECTION).doc(cacheDocId(draft.week));
  await ref.set(
    {
      kind: 'weekly',
      templateVersion: DRAFT_TEMPLATE_VERSION,
      inputHash,
      weekStart: draft.week.start.toISOString(),
      weekEnd: draft.week.end.toISOString(),
      weekLabelDa: draft.week.labelDa,
      weekIsoWeek: draft.week.isoWeek,
      subject: draft.subject,
      html: draft.html,
      headline: draft.headline,
      intro: draft.intro,
      warnings: draft.warnings.slice(0, 40),
      articles: draft.articles.map((a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        thumbUrl: a.thumbUrl || null,
        lastPublished: a.lastPublished,
        url: a.url,
        subtitle: a.subtitle ?? null,
        ratingStars: a.ratingStars ?? null,
        metaCategoryLine: a.metaCategoryLine ?? null,
        authorItemId: a.authorItemId ?? null,
        authorName: a.authorName ?? null,
      })),
      generatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function draftHitFromStoredFields(d: Record<string, unknown>): DraftCacheHit | DraftCacheMiss {
  const weekStart = typeof d.weekStart === 'string' ? d.weekStart : '';
  const weekEnd = typeof d.weekEnd === 'string' ? d.weekEnd : '';
  const labelDa = typeof d.weekLabelDa === 'string' ? d.weekLabelDa : '';
  const isoWeek = typeof d.weekIsoWeek === 'number' && Number.isFinite(d.weekIsoWeek) ? d.weekIsoWeek : 0;
  const subject = typeof d.subject === 'string' ? d.subject : '';
  const html = typeof d.html === 'string' ? d.html : '';
  const headline = typeof d.headline === 'string' ? d.headline : '';
  const intro = typeof d.intro === 'string' ? d.intro : '';
  if (!weekStart || !weekEnd || !subject || !html || !headline) return { hit: false };
  if (isStaleCacheDoc(d)) return { hit: false };

  const warnings = Array.isArray(d.warnings) ? d.warnings.filter((w) => typeof w === 'string') : [];
  const articles = Array.isArray(d.articles)
    ? d.articles
        .filter((a) => a && typeof a === 'object')
        .map((a) => {
          const row = a as Record<string, unknown>;
          return {
            id: String(row.id ?? ''),
            title: String(row.title ?? ''),
            slug: String(row.slug ?? ''),
            excerpt: String(row.excerpt ?? ''),
            thumbUrl: typeof row.thumbUrl === 'string' ? row.thumbUrl : null,
            lastPublished: String(row.lastPublished ?? ''),
            url: String(row.url ?? ''),
            subtitle: typeof row.subtitle === 'string' ? row.subtitle : null,
            ratingStars:
              typeof row.ratingStars === 'number' && Number.isFinite(row.ratingStars)
                ? row.ratingStars
                : null,
            metaCategoryLine: typeof row.metaCategoryLine === 'string' ? row.metaCategoryLine : null,
            authorItemId: typeof row.authorItemId === 'string' ? row.authorItemId : null,
            authorName: typeof row.authorName === 'string' ? row.authorName : null,
          };
        })
    : [];

  const generatedAtTs = d.generatedAt as Timestamp | undefined;
  return {
    hit: true,
    generatedAt: generatedAtTs ? generatedAtTs.toDate().toISOString() : null,
    draft: {
      week: {
        start: new Date(weekStart),
        end: new Date(weekEnd),
        labelDa,
        isoWeek,
      },
      subject,
      html,
      headline,
      intro,
      articles,
      warnings,
    },
  };
}

function generatedAtMillis(d: Record<string, unknown>): number {
  const ts = d.generatedAt as Timestamp | undefined;
  if (!ts || typeof ts.toMillis !== 'function') return 0;
  try {
    return ts.toMillis();
  } catch {
    return 0;
  }
}

/** Senest genererede ugentlige draft (uanset uge/hash) til hurtig initial visning i UI. */
export async function readLatestWeeklyDraftCache(): Promise<DraftCacheHit | DraftCacheMiss> {
  const db = getAdminDb();
  if (!db) return { hit: false };

  const pickLatest = (docs: QueryDocumentSnapshot[]): DraftCacheHit | DraftCacheMiss => {
    if (docs.length === 0) return { hit: false };
    const sorted = [...docs].sort((a, b) => generatedAtMillis(b.data() as Record<string, unknown>) - generatedAtMillis(a.data() as Record<string, unknown>));
    for (const doc of sorted) {
      const hit = draftHitFromStoredFields(doc.data() as Record<string, unknown>);
      if (hit.hit) return hit;
    }
    return { hit: false };
  };

  try {
    const snap = await db
      .collection(DRAFT_CACHE_COLLECTION)
      .where('kind', '==', 'weekly')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();
    if (!snap.empty) {
      const hit = draftHitFromStoredFields(snap.docs[0].data() as Record<string, unknown>);
      if (hit.hit) return hit;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const indexMissing = /FAILED_PRECONDITION|requires an index|composite/i.test(msg);
    if (!indexMissing) console.warn('[newsletter/draft-cache] readLatestWeeklyDraftCache:', e);
  }

  try {
    const snap = await db.collection(DRAFT_CACHE_COLLECTION).where('kind', '==', 'weekly').limit(80).get();
    return pickLatest(snap.docs);
  } catch (e) {
    console.warn('[newsletter/draft-cache] readLatestWeeklyDraftCache fallback:', e);
    return { hit: false };
  }
}

/** Læs cache for en bestemt uge uden hash-check (stabil ved åbning af UI). */
export async function readWeeklyDraftCacheByWeek(week: WeekRange): Promise<DraftCacheHit | DraftCacheMiss> {
  const db = getAdminDb();
  if (!db) return { hit: false };
  try {
    const snap = await db.collection(DRAFT_CACHE_COLLECTION).doc(cacheDocId(week)).get();
    if (!snap.exists) return { hit: false };
    const d = snap.data() as Record<string, unknown>;
    return parseCachedDraftData(d, week);
  } catch {
    return { hit: false };
  }
}
