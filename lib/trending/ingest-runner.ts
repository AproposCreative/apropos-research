/**
 * Server-side ingest runner — den serverless-venlige tvilling til
 * `src/cli/ingest-rage.ts`.
 *
 * Hvor CLI-versionen skriver til JSONL-filer (kun brugbar lokalt), bruger
 * denne udgave Firestore-storen og kan derfor køre fra Vercel cron eller
 * en API route.
 *
 * Genbruger eksisterende fetch/parse/discovery-moduler så vi har én
 * sandhed for hvad en "trending-artikel" er.
 */

import pino from 'pino';
import { discoverFromFeed } from '@/src/discovery/feeds';
import { discoverFromSitemaps } from '@/src/discovery/sitemap';
import { fetchText } from '@/src/fetch/fetch';
import { parseArticleHtml } from '@/src/parse/article';
import { sha256 } from '@/src/utils/hash';
import { getDefaultMediaSources, getAllEnabledMediaSources } from '@/lib/getMediaSources';
import {
  upsertTrendingArticles,
  pruneOldTrendingArticles,
  type TrendingArticleInput,
} from '@/lib/trending/firestore-store';
import { logger as appLogger } from '@/lib/logger';

const logger = pino({ level: 'info' });

export interface IngestOptions {
  feedOnly?: boolean;
  sitemapOnly?: boolean;
  noRobots?: boolean;
  /** Kun candidates publiceret nyere end nu - sinceHrs. */
  sinceHrs?: number;
  /** Maks candidates at fetche per kørsel. */
  limit?: number;
  /** Filtrér på en bestemt source.id. */
  source?: string;
  /** Slet artikler ældre end N dage efter ingest. Default: ingen prune. */
  pruneOlderThanDays?: number;
}

export interface IngestMetrics {
  discovered: number;
  fetched_ok: number;
  fetched_304: number;
  fetched_fail: number;
  ignored: number;
  added: number;
  updated: number;
  unchanged: number;
  pruned: number;
  durationMs: number;
}

interface MediaSourceLite {
  id: string;
  name: string;
  baseUrl: string;
}

function buildSourceMap(sources: MediaSourceLite[]): Map<string, { id: string; name: string }> {
  const map = new Map<string, { id: string; name: string }>();
  for (const s of sources) {
    try {
      const u = new URL(s.baseUrl);
      const domain = u.hostname.replace(/^www\./, '').toLowerCase();
      map.set(domain, { id: s.id, name: s.name });
      map.set(s.id.toLowerCase(), { id: s.id, name: s.name });
      map.set(s.name.toLowerCase(), { id: s.id, name: s.name });
    } catch {
      // skip invalid URL
    }
  }
  return map;
}

function resolveSourceFromUrl(
  url: string,
  map: Map<string, { id: string; name: string }>
): { id: string; name: string } | null {
  try {
    const u = new URL(url);
    const domain = u.hostname.replace(/^www\./, '').toLowerCase();
    const direct = map.get(domain);
    if (direct) return direct;
    for (const [key, value] of map.entries()) {
      if (domain.includes(key) || key.includes(domain)) return value;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Kør én ingest-runde og persistér til Firestore.
 *
 * Designet til at være safe at kalde fra serverless (under maxDuration: 300s).
 * Ingen procespuljer, ingen fil-skriv, ingen subprocess-exec.
 */
export async function runIngestToFirestore(opts: IngestOptions = {}): Promise<IngestMetrics> {
  const start = Date.now();
  const metrics: IngestMetrics = {
    discovered: 0,
    fetched_ok: 0,
    fetched_304: 0,
    fetched_fail: 0,
    ignored: 0,
    added: 0,
    updated: 0,
    unchanged: 0,
    pruned: 0,
    durationMs: 0,
  };

  // Resolve media sources (fra Firestore eller default-fallback).
  let sources: MediaSourceLite[] = [];
  try {
    const all = await getAllEnabledMediaSources();
    sources = all.map((s) => ({ id: s.id, name: s.name, baseUrl: s.baseUrl }));
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'falling back to default media sources');
    sources = getDefaultMediaSources().map((s) => ({ id: s.id, name: s.name, baseUrl: s.baseUrl }));
  }
  const sourceMap = buildSourceMap(sources);

  // Discover candidates fra feeds + sitemaps (kan slås fra individuelt).
  let candidates: { url: string; published_at?: string; source?: string }[] = [];
  if (!opts.sitemapOnly) {
    try {
      candidates = await discoverFromFeed();
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'feed-discovery failed');
    }
  }
  if (!opts.feedOnly) {
    try {
      const urls = await discoverFromSitemaps();
      const fromSitemap = urls.map((url) => {
        const sourceInfo = resolveSourceFromUrl(url, sourceMap);
        return { url, source: sourceInfo?.id ?? 'unknown' };
      });
      candidates = candidates.concat(fromSitemap);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'sitemap-discovery failed');
    }
  }

  // Apply since-filter.
  const sinceCutoff = opts.sinceHrs ? Date.now() - opts.sinceHrs * 3600_000 : undefined;
  let filtered = candidates.filter((c) => {
    if (!sinceCutoff) return true;
    if (c.published_at) {
      const t = Date.parse(c.published_at);
      if (!Number.isNaN(t)) return t >= sinceCutoff;
    }
    // Sitemap-URLs uden published_at slipper igennem her — limit'en kapper alligevel.
    return true;
  });

  // Apply source-filter.
  if (opts.source) {
    filtered = filtered.filter((c) => c.source === opts.source);
  }

  // Dedup på URL og enforce limit.
  const seen = new Set<string>();
  const unique: { url: string; source?: string }[] = [];
  for (const c of filtered) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    unique.push({ url: c.url, source: c.source });
    if (opts.limit && unique.length >= opts.limit) break;
  }
  metrics.discovered = unique.length;

  if (unique.length === 0) {
    logger.warn({ feedOnly: opts.feedOnly, sitemapOnly: opts.sitemapOnly, since_hours: opts.sinceHrs }, 'no candidates discovered');
  }

  // Fetch + parse hver candidate, byg op til Firestore-batch.
  const records: TrendingArticleInput[] = [];
  for (const { url, source } of unique) {
    try {
      const { text, contentType, status } = await fetchText(url, { noRobots: opts.noRobots });
      if (status === 304) {
        metrics.fetched_304++;
        continue;
      }
      if (!contentType || !contentType.includes('html')) {
        metrics.ignored++;
        continue;
      }
      metrics.fetched_ok++;

      const parsed = parseArticleHtml(url, text);
      if (!parsed || !parsed.title || !parsed.body_text || parsed.body_text.length < 80) {
        metrics.ignored++;
        continue;
      }

      const finalSource =
        !source || source === 'unknown' ? resolveSourceFromUrl(url, sourceMap)?.id ?? 'unknown' : source;
      const sourceMeta = sourceMap.get(finalSource.toLowerCase());

      records.push({
        url,
        title: parsed.title,
        body_text: parsed.body_text,
        hash: sha256(parsed.body_text),
        source: finalSource,
        sourceName: sourceMeta?.name,
        category: parsed.category,
        date: parsed.date || new Date().toISOString(),
        published_at: parsed.date || new Date().toISOString(),
        fetched_at: new Date().toISOString(),
        image: parsed.image,
      });
    } catch (err) {
      metrics.fetched_fail++;
      logger.warn({ url, err: err instanceof Error ? err.message : String(err) }, 'fetch-failed');
    }
  }

  // Upsert til Firestore.
  if (records.length > 0) {
    const result = await upsertTrendingArticles(records);
    metrics.added = result.added;
    metrics.updated = result.updated;
    metrics.unchanged = result.unchanged;
  }

  // Prune (optional).
  if (opts.pruneOlderThanDays && opts.pruneOlderThanDays > 0) {
    try {
      const pruneResult = await pruneOldTrendingArticles(opts.pruneOlderThanDays);
      metrics.pruned = pruneResult.deleted;
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'prune-failed');
    }
  }

  metrics.durationMs = Date.now() - start;
  appLogger.info('[trending/ingest-runner] complete', { ...metrics });

  return metrics;
}
