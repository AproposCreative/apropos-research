/**
 * Firestore-baseret trending-artikel store.
 *
 * Erstatter den gamle filsystem-baserede `data/rage_articles.jsonl`-pipeline
 * der ikke kunne fungere på Vercel serverless (read-only filesystem).
 *
 * Schema (collection `trendingArticles`):
 *   docId         = sha-1(normalizedUrl)  // O(1) dedup
 *   url           string
 *   title         string
 *   source        string                  // mediaSource.id (gaffa, soundvenue, ...)
 *   sourceName    string?
 *   category      string?
 *   tags          string[]?
 *   body_text     string                   // fuld artikeltekst (capped 50 KB)
 *   summary       string?
 *   image         string?
 *   date          string                   // original ISO eller hvad parser fandt
 *   publishedAt   Timestamp                // server-normaliseret, til indexing
 *   hash          string                   // sha-256 af body — change-detect
 *   fetchedAt     Timestamp
 *   createdAt     Timestamp
 *   updatedAt     Timestamp
 *
 * Composite index (lav i Firebase Console hvis Firestore beder om det):
 *   publishedAt DESC
 *   (+ source ASC hvis source-filtreret query bruges meget)
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import crypto from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { logger } from '@/lib/logger';

const COLLECTION = 'trendingArticles';
const MAX_BODY_BYTES = 50_000; // ~50 KB per doc — Firestore limit er 1 MB
const FIRESTORE_BATCH_LIMIT = 450; // Firestore tillader 500 ops; lad lidt margen

export interface TrendingArticleInput {
  url: string;
  title: string;
  body_text: string;
  hash: string;
  source: string;
  sourceName?: string;
  category?: string;
  tags?: string[];
  summary?: string;
  image?: string;
  date?: string;
  fetched_at?: string;
  published_at?: string;
}

export interface TrendingArticleRecord {
  url: string;
  title: string;
  body_text: string;
  hash: string;
  source: string;
  sourceName?: string;
  category?: string;
  tags?: string[];
  summary?: string;
  image?: string;
  date?: string;
  publishedAt?: Date;
  fetchedAt?: Date;
}

/** Normaliser URL så samme artikel via http/https/?utm-varianter dedupes korrekt. */
function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    // Strip almindelige tracking-parametre fra dedup-nøglen.
    const drop = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid'];
    for (const k of drop) u.searchParams.delete(k);
    // Trailing slash konsistens.
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return rawUrl;
  }
}

function urlToDocId(url: string): string {
  return crypto.createHash('sha1').update(normalizeUrl(url)).digest('hex');
}

function safeDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  // Try ISO first
  let ts = Date.parse(dateStr);
  if (!Number.isNaN(ts)) return new Date(ts);
  // DD-MM-YYYY (GAFFA-format)
  const m = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?$/);
  if (m) {
    const [, day, month, year, h = '00', mi = '00', se = '00'] = m;
    ts = Date.parse(
      `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${h.padStart(2, '0')}:${mi.padStart(2, '0')}:${se.padStart(2, '0')}Z`
    );
    if (!Number.isNaN(ts)) return new Date(ts);
  }
  return null;
}

function truncateBody(body: string): string {
  if (!body) return '';
  if (Buffer.byteLength(body, 'utf8') <= MAX_BODY_BYTES) return body;
  // Trim hård — body bruges kun til AI-context, så tab er acceptabelt.
  let truncated = body;
  while (Buffer.byteLength(truncated, 'utf8') > MAX_BODY_BYTES) {
    truncated = truncated.slice(0, Math.floor(truncated.length * 0.9));
  }
  return truncated;
}

/**
 * Upsert en batch trending-artikler. Idempotent — samme URL skriver oven på
 * sig selv kun hvis hash er ændret. Returnerer { added, updated, unchanged }.
 */
export async function upsertTrendingArticles(
  inputs: TrendingArticleInput[]
): Promise<{ added: number; updated: number; unchanged: number; skipped: number }> {
  const db = getAdminDb();
  if (!db) {
    logger.warn('[trending/firestore-store] Admin DB not available — skipping upsert');
    return { added: 0, updated: 0, unchanged: 0, skipped: inputs.length };
  }

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  // Slå eksisterende docs op først (chunked) for at vide om vi laver add eller update.
  for (let i = 0; i < inputs.length; i += FIRESTORE_BATCH_LIMIT) {
    const slice = inputs.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const refs = slice.map((a) => db.collection(COLLECTION).doc(urlToDocId(a.url)));

    const snaps = await db.getAll(...refs);
    const batch = db.batch();
    let opsInBatch = 0;

    snaps.forEach((snap, idx) => {
      const input = slice[idx];
      const ref = refs[idx];

      if (!input.url || !input.title) {
        skipped++;
        return;
      }

      const dateStr = input.date || input.published_at;
      const publishedDate = safeDate(dateStr);
      const fetchedDate = safeDate(input.fetched_at) || new Date();

      const body = truncateBody(input.body_text || '');

      if (!snap.exists) {
        const data: Record<string, unknown> = {
          url: input.url,
          title: input.title,
          body_text: body,
          hash: input.hash,
          source: input.source,
          ...(input.sourceName ? { sourceName: input.sourceName } : {}),
          ...(input.category ? { category: input.category } : {}),
          ...(input.tags ? { tags: input.tags } : {}),
          ...(input.summary ? { summary: input.summary } : {}),
          ...(input.image ? { image: input.image } : {}),
          ...(dateStr ? { date: dateStr } : {}),
          ...(publishedDate ? { publishedAt: Timestamp.fromDate(publishedDate) } : {}),
          fetchedAt: Timestamp.fromDate(fetchedDate),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        batch.set(ref, data);
        opsInBatch++;
        added++;
      } else {
        const prev = snap.data() as { hash?: string };
        if (prev?.hash === input.hash) {
          unchanged++;
          return;
        }
        const data: Record<string, unknown> = {
          title: input.title,
          body_text: body,
          hash: input.hash,
          ...(input.sourceName ? { sourceName: input.sourceName } : {}),
          ...(input.category ? { category: input.category } : {}),
          ...(input.tags ? { tags: input.tags } : {}),
          ...(input.summary ? { summary: input.summary } : {}),
          ...(input.image ? { image: input.image } : {}),
          ...(dateStr ? { date: dateStr } : {}),
          ...(publishedDate ? { publishedAt: Timestamp.fromDate(publishedDate) } : {}),
          fetchedAt: Timestamp.fromDate(fetchedDate),
          updatedAt: FieldValue.serverTimestamp(),
        };
        batch.set(ref, data, { merge: true });
        opsInBatch++;
        updated++;
      }
    });

    if (opsInBatch > 0) {
      await batch.commit();
    }
  }

  logger.info('[trending/firestore-store] upsert complete', {
    added,
    updated,
    unchanged,
    skipped,
    total: inputs.length,
  });

  return { added, updated, unchanged, skipped };
}

export interface FetchTrendingOptions {
  /** Antal dage tilbage i tiden — default 7. */
  days?: number;
  /** Maks artikler at returnere — default 200. */
  limit?: number;
  /** Filtrer på en specifik source.id. */
  source?: string;
}

/**
 * Hent seneste trending-artikler. Returnerer objekter der matcher
 * `SimpleArticle`-format som `/api/trending` forventer.
 */
export async function getRecentTrendingArticles(
  options: FetchTrendingOptions = {}
): Promise<TrendingArticleRecord[]> {
  const db = getAdminDb();
  if (!db) {
    logger.warn('[trending/firestore-store] Admin DB not available — returning []');
    return [];
  }

  const { days = 7, limit = 200, source } = options;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  let query: FirebaseFirestore.Query = db.collection(COLLECTION).where('publishedAt', '>=', Timestamp.fromDate(cutoff));
  if (source) {
    query = query.where('source', '==', source);
  }
  query = query.orderBy('publishedAt', 'desc').limit(limit);

  let snap: FirebaseFirestore.QuerySnapshot;
  try {
    snap = await query.get();
  } catch (err) {
    // Manglende composite index → degraderer til un-ordered query.
    logger.warn('[trending/firestore-store] composite index missing, falling back', {
      err: err instanceof Error ? err.message : String(err),
    });
    const fallbackQuery: FirebaseFirestore.Query = source
      ? db.collection(COLLECTION).where('source', '==', source).limit(limit)
      : db.collection(COLLECTION).limit(limit);
    snap = await fallbackQuery.get();
  }

  const out: TrendingArticleRecord[] = [];
  snap.forEach((doc) => {
    const d = doc.data();
    const publishedAt =
      d.publishedAt && typeof (d.publishedAt as Timestamp).toDate === 'function'
        ? (d.publishedAt as Timestamp).toDate()
        : undefined;
    const fetchedAt =
      d.fetchedAt && typeof (d.fetchedAt as Timestamp).toDate === 'function'
        ? (d.fetchedAt as Timestamp).toDate()
        : undefined;

    // Post-filter for fallback path (når index ikke findes).
    if (publishedAt && publishedAt < cutoff) return;

    out.push({
      url: String(d.url || ''),
      title: String(d.title || ''),
      body_text: String(d.body_text || ''),
      hash: String(d.hash || ''),
      source: String(d.source || ''),
      sourceName: typeof d.sourceName === 'string' ? d.sourceName : undefined,
      category: typeof d.category === 'string' ? d.category : undefined,
      tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === 'string') : undefined,
      summary: typeof d.summary === 'string' ? d.summary : undefined,
      image: typeof d.image === 'string' ? d.image : undefined,
      date: typeof d.date === 'string' ? d.date : undefined,
      publishedAt,
      fetchedAt,
    });
  });

  // Sort by publishedAt desc i memory (også vigtig for fallback path).
  out.sort((a, b) => {
    const ta = a.publishedAt?.getTime() ?? 0;
    const tb = b.publishedAt?.getTime() ?? 0;
    return tb - ta;
  });

  return out.slice(0, limit);
}

/** Slet artikler ældre end `daysToKeep` for at holde collection slank. */
export async function pruneOldTrendingArticles(daysToKeep = 30): Promise<{ deleted: number }> {
  const db = getAdminDb();
  if (!db) return { deleted: 0 };

  const cutoff = Timestamp.fromDate(new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000));
  const snap = await db
    .collection(COLLECTION)
    .where('publishedAt', '<', cutoff)
    .limit(FIRESTORE_BATCH_LIMIT)
    .get();

  if (snap.empty) return { deleted: 0 };

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  logger.info('[trending/firestore-store] pruned old articles', { deleted: snap.size });
  return { deleted: snap.size };
}

/** Tæl total antal docs i collection — bruges til monitoring/debug. */
export async function countTrendingArticles(): Promise<number> {
  const db = getAdminDb();
  if (!db) return 0;
  try {
    const agg = await db.collection(COLLECTION).count().get();
    return agg.data().count;
  } catch {
    // Aggregation queries kræver index/permission — fallback til estimeret.
    const snap = await db.collection(COLLECTION).limit(10_000).get();
    return snap.size;
  }
}
