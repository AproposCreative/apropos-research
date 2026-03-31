#!/usr/bin/env node
import { env } from "../utils/env";
import { discoverFromFeed } from "../discovery/feeds";
import { discoverFromSitemaps } from "../discovery/sitemap";
import { fetchText } from "../fetch/fetch";
import { parseArticleHtml } from "../parse/article";
import { sha256 } from "../utils/hash";
import { appendArticles, appendPrompts } from "../store/jsonl";
import pino from "pino";
import path from "node:path";

const logger = pino({ level: "info" });

function parseArgs() {
  const argv = process.argv.slice(2);
  const isDry = argv.includes("--dry");
  const feedOnly = argv.includes("--feedOnly");
  const sitemapOnly = argv.includes("--sitemapOnly");
  const noRobots = argv.includes("--noRobots");
  const sinceArg = argv.find((a) => a.startsWith("--since="));
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const sourceArg = argv.find((a) => a.startsWith("--source="));
  const sinceHrs = sinceArg ? Number(sinceArg.split("=")[1]) : undefined;
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
  const source = sourceArg ? sourceArg.split("=")[1] : undefined;
  return { isDry, feedOnly, sitemapOnly, noRobots, sinceHrs, limit, source };
}

export async function ingestOnce(opts: { feedOnly?: boolean; sitemapOnly?: boolean; noRobots?: boolean; sinceHrs?: number; limit?: number; source?: string }) {
  const metrics = {
    discovered: 0,
    fetched_ok: 0,
    fetched_304: 0,
    fetched_fail: 0,
    new: 0,
    updated: 0, // reserved for future update semantics
    ignored: 0,
    prompts_added: 0,
    bulletsAdded: 0,
  };

  let mediaSourcesMap: Map<string, { id: string; name: string }> = new Map();
  try {
    const { getAllEnabledMediaSources, getDefaultMediaSources } = await import("../../lib/getMediaSources");
    let sources: any[];
    try {
      sources = await getAllEnabledMediaSources();
    } catch {
      sources = getDefaultMediaSources();
    }
    for (const source of sources) {
      try {
        const url = new URL(source.baseUrl);
        const domain = url.hostname.replace('www.', '').toLowerCase();
        mediaSourcesMap.set(domain, { id: source.id, name: source.name });
        mediaSourcesMap.set(source.id.toLowerCase(), { id: source.id, name: source.name });
        mediaSourcesMap.set(source.name.toLowerCase(), { id: source.id, name: source.name });
      } catch {}
    }
  } catch (err) {
    logger.warn({ err }, "Could not load media sources, using fallback mapping");
  }

  // Helper to determine source from URL
  const getSourceFromUrl = (url: string): { id: string; name: string } | null => {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '').toLowerCase();
      const mapped = mediaSourcesMap.get(domain);
      if (mapped) return mapped;
      
      // Fallback to domain-based matching
      for (const [key, value] of mediaSourcesMap.entries()) {
        if (domain.includes(key) || key.includes(domain)) {
          return value;
        }
      }
    } catch {}
    return null;
  };

  let candidates: { url: string; published_at?: string; source?: string }[] = [];
  if (!opts.sitemapOnly) {
    candidates = await discoverFromFeed();
  }
  if (!opts.feedOnly) {
    const urls = await discoverFromSitemaps();
    candidates = candidates.concat(urls.map((url) => {
      // Determine source from URL using media sources
      const sourceInfo = getSourceFromUrl(url);
      const source = sourceInfo ? sourceInfo.id : 'unknown';
      return { url, source };
    }));
  }

  // since filter
  const sinceCutoff = opts.sinceHrs ? Date.now() - opts.sinceHrs * 3600_000 : undefined;
  let filtered = candidates.filter((c) => {
    if (!sinceCutoff) return true;
    if (c.published_at) {
      const t = Date.parse(c.published_at);
      if (!Number.isNaN(t)) return t >= sinceCutoff;
    }
    // Include sitemap URLs even without published_at (they'll be fetched and dated)
    return true; // unknown dates are included, but limited later
  });

  // source filter
  if (opts.source) {
    filtered = filtered.filter((c) => c.source === opts.source);
  }

  // unique and apply limit
  const seen = new Set<string>();
  const uniqueCandidates: { url: string; source?: string }[] = [];
  for (const c of filtered) {
    if (!seen.has(c.url)) {
      seen.add(c.url);
      uniqueCandidates.push({ url: c.url, source: c.source });
    }
    if (opts.limit && uniqueCandidates.length >= opts.limit) break;
  }
  metrics.discovered = uniqueCandidates.length;

  // Load existing articles to skip URLs we already have (unless we need to check for updates)
  // HTTP 304 will handle most cases, but we can optimize by checking URLs first
  const articlesPath = path.resolve(env.RAGE_STORAGE_DIR, "rage_articles.jsonl");
  let existingArticles: any[] = [];
  try {
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(articlesPath, "utf8").catch(() => "");
    if (content.trim()) {
      existingArticles = content
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((a) => a !== null);
    }
  } catch {
    // File doesn't exist or can't be read, start fresh
    existingArticles = [];
  }
  const existingUrls = new Set(existingArticles.map((a: any) => a.url));
  
  logger.info({ 
    total_candidates: uniqueCandidates.length,
    existing_urls: existingUrls.size,
    new_urls: uniqueCandidates.filter((c) => !existingUrls.has(c.url)).length,
    candidates_before_filter: filtered.length,
    feed_items: candidates.filter(c => c.source).length,
    sitemap_items: candidates.length - candidates.filter(c => c.source).length
  }, "url-classification");
  
  // Log if no candidates found
  if (uniqueCandidates.length === 0) {
    logger.warn({ 
      message: "No article candidates found!",
      feed_discovery: !opts.sitemapOnly,
      sitemap_discovery: !opts.feedOnly,
      since_hours: opts.sinceHrs,
      limit: opts.limit
    }, "no-candidates");
  }

  const articleRecords = [] as any[];
  const promptRecords = [] as any[];

  // Process all candidates - HTTP 304 will skip unchanged articles automatically
  // The fetchText function already uses If-None-Match/If-Modified-Since headers
  for (const { url, source } of uniqueCandidates) {
    try {
      const { text, contentType, status } = await fetchText(url, { noRobots: opts.noRobots });
      if (status === 304) {
        metrics.fetched_304++;
        continue;
      }
      if (!contentType || !contentType.includes("html")) {
        metrics.ignored++;
        continue;
      }
      metrics.fetched_ok++;
      const parsed = parseArticleHtml(url, text);
      if (!parsed) continue;
      const hash = sha256(parsed.body_text);
      
      // Ensure source is properly set from URL if not provided
      let finalSource = source;
      if (!finalSource || finalSource === 'unknown') {
        const sourceInfo = getSourceFromUrl(url);
        finalSource = sourceInfo ? sourceInfo.id : 'unknown';
      }
      
      // Use parsed.date if available, otherwise use current date as fallback
      const articleDate = parsed.date || new Date().toISOString();
      
      articleRecords.push({
        url,
        hash,
        title: parsed.title,
        author: parsed.author,
        category: parsed.category,
        published_at: articleDate,
        date: articleDate, // Also set date field for compatibility
        fetched_at: new Date().toISOString(), // Track when we fetched it
        body_text: parsed.body_text,
        image: parsed.image,
        source: finalSource,
      });
      const { summary, bullets, chunks } = (await import("../prompt/builder")).buildPrompts({
        title: parsed.title,
        body_text: parsed.body_text,
      });
      metrics.bulletsAdded += bullets.length;
      chunks.forEach((chunk, i) => {
        promptRecords.push({
          url,
          hash,
          title: parsed.title,
          summary,
          bullets,
          chunk_index: i,
          chunk_text: chunk,
          image: parsed.image,
          source: finalSource,
          published_at: articleDate,
          date: articleDate,
          fetched_at: new Date().toISOString(),
        });
      });
    } catch (err: any) {
      logger.warn({ url, err: String(err?.message ?? err) }, "skip-url");
      metrics.fetched_fail++;
    }
  }

  const a = await appendArticles(articleRecords);
  const p = await appendPrompts(promptRecords);
  metrics.new = a.added;
  metrics.prompts_added = p.added;

  // metrics log line
  logger.info({ rage_metrics: metrics }, "metrics");
  return { newArticles: a.added, skippedArticles: a.skipped, newChunks: p.added, skippedChunks: p.skipped, metrics };
}

async function main() {
  const { isDry, feedOnly, sitemapOnly, noRobots, sinceHrs, limit, source } = parseArgs();
  if (isDry) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "dry",
          baseUrl: env.RAGE_BASE_URL,
          storageDir: env.RAGE_STORAGE_DIR,
          rateLimitRps: env.RAGE_RATE_LIMIT_RPS,
          userAgent: env.RAGE_USER_AGENT,
          flags: { feedOnly, sitemapOnly, noRobots, sinceHrs, limit, source },
        },
        null,
        2
      )
    );
    return;
  }

  const res = await ingestOnce({ feedOnly, sitemapOnly, noRobots, sinceHrs, limit, source });
  logger.info(
    {
      articles: { added: res.newArticles, skipped: res.skippedArticles },
      chunks: { added: res.newChunks, skipped: res.skippedChunks },
      paths: {
        articles: path.resolve(env.RAGE_STORAGE_DIR, "rage_articles.jsonl"),
        prompts: path.resolve("./prompts", "rage_prompts.jsonl"),
      },
    },
    "ingest-status"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


