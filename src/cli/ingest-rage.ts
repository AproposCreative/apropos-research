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

async function ingestOnce(opts: { feedOnly?: boolean; sitemapOnly?: boolean; noRobots?: boolean; sinceHrs?: number; limit?: number; source?: string }) {
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

  let candidates: { url: string; published_at?: string; source?: string }[] = [];
  if (!opts.sitemapOnly) {
    candidates = await discoverFromFeed();
  }
  if (!opts.feedOnly) {
    const urls = await discoverFromSitemaps();
    candidates = candidates.concat(urls.map((url) => {
      // Determine source from URL
      let source = 'unknown';
      if (url.includes('soundvenue.com')) source = 'soundvenue';
      else if (url.includes('gaffa.dk')) source = 'gaffa';
      else if (url.includes('euroman.dk')) source = 'euroman';
      else if (url.includes('berlingske.dk')) source = 'berlingske';
      else if (url.includes('bt.dk')) source = 'bt';
      else if (url.includes('nordic.ign.com')) source = 'ign-nordic';
      else if (url.includes('politiken.dk')) source = 'politiken';
      else if (url.includes('ekkofilm.dk')) source = 'ekkofilm';
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

  const articleRecords = [] as any[];
  const promptRecords = [] as any[];

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
      articleRecords.push({
        url,
        hash,
        title: parsed.title,
        author: parsed.author,
        category: parsed.category,
        published_at: parsed.date,
        body_text: parsed.body_text,
        image: parsed.image,
        source: source || 'unknown',
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
          source: source || 'unknown',
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


