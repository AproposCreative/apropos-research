import type { EditorialSource } from '@/lib/editorial/types';
import { getResearch } from '@/lib/research/service';

type SearchLogger = {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
};

const noopLogger: SearchLogger = { debug: () => undefined };

/** Skip repeat calls when GCP project lacks Custom Search JSON API access. */
let googleCustomSearchUnavailable = false;

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(input: string): string {
  return decodeHtmlEntities(input).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sourceDomain(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function timedFetch(input: string, init: RequestInit = {}, timeoutMs = 6500): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function enrichSource(source: EditorialSource, strategy: string): EditorialSource {
  const domain = sourceDomain(source.url);
  const contentLength = source.content.trim().length;
  return {
    ...source,
    title: stripHtml(source.title),
    content: stripHtml(source.content),
    strategy,
    domain,
    score: Math.min(100, 45 + (source.url ? 20 : 0) + (domain ? 10 : 0) + Math.min(25, Math.floor(contentLength / 20))),
  };
}

function dedupeSources(items: EditorialSource[]): EditorialSource[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeKey(`${item.url || ''} ${item.title}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchGoogle(query: string, logger: SearchLogger): Promise<EditorialSource[]> {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
  if (!apiKey || !cx || googleCustomSearchUnavailable) return [];

  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=5&lr=lang_da|lang_en`;
    const res = await timedFetch(url);
    if (!res.ok) {
      let apiMessage = '';
      try {
        const errBody = await res.json();
        apiMessage = String(errBody?.error?.message || '');
      } catch {
        // ignore parse errors
      }
      if (
        res.status === 403 &&
        /does not have the access to Custom Search JSON API/i.test(apiMessage)
      ) {
        googleCustomSearchUnavailable = true;
        logger.warn?.(
          'Google Custom Search JSON API is not enabled for this GCP project — using Wikipedia, Google News RSS and DuckDuckGo instead',
          {
            status: res.status,
            fix: 'Enable "Custom Search API" in Google Cloud Console → APIs & Services → Library',
          }
        );
      } else {
        logger.debug('Google Custom Search failed', { status: res.status, message: apiMessage || undefined });
      }
      return [];
    }
    const data = await res.json();
    const items: any[] = data.items || [];
    return items.map((item: any) => ({
      title: item.title || '',
      content: item.snippet || '',
      source: 'Google',
      url: item.link || null,
    }));
  } catch (error) {
    logger.debug('Google Custom Search error', { error: String(error) });
    return [];
  }
}

async function searchWikipedia(query: string, logger: SearchLogger): Promise<EditorialSource[]> {
  const results: EditorialSource[] = [];

  try {
    const searchRes = await timedFetch(`https://da.wikipedia.org/api/rest_v1/page/search/${encodeURIComponent(query)}?limit=3`);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      for (const page of (searchData.pages || []).slice(0, 2)) {
        const summaryRes = await timedFetch(`https://da.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.title)}`).catch(() => null);
        if (!summaryRes?.ok) continue;
        const summary = await summaryRes.json();
        if (summary.extract) {
          results.push({
            title: summary.title || 'Wikipedia',
            content: String(summary.extract).slice(0, 600),
            source: 'Wikipedia (Dansk)',
            url: summary.content_urls?.desktop?.page || null,
          });
        }
      }
    }
  } catch (error) {
    logger.debug('Wikipedia search failed', { error: String(error) });
  }

  return results;
}

async function searchDuckDuckGo(query: string, logger: SearchLogger): Promise<EditorialSource[]> {
  const results: EditorialSource[] = [];
  try {
    const res = await timedFetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
    if (res.ok) {
      const data = await res.json();
      if (data.Abstract) results.push({ title: data.Heading || 'Abstract', content: data.Abstract, source: 'DuckDuckGo', url: data.AbstractURL || null });
      if (data.Definition) results.push({ title: 'Definition', content: data.Definition, source: 'DuckDuckGo', url: data.DefinitionURL || null });
    }
  } catch (error) {
    logger.debug('DuckDuckGo search failed', { error: String(error) });
  }
  return results;
}

async function searchDuckDuckGoHtml(query: string, logger: SearchLogger): Promise<EditorialSource[]> {
  try {
    const res = await timedFetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AproposBot/1.0)' },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const out: EditorialSource[] = [];
    const resultRe = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null = null;
    while ((match = resultRe.exec(html)) !== null && out.length < 6) {
      let url = match[1] || '';
      try {
        if (url.startsWith('/')) {
          const parsed = new URL(`https://duckduckgo.com${url}`);
          const uddg = parsed.searchParams.get('uddg');
          if (uddg) url = decodeURIComponent(uddg);
        }
      } catch {
        // keep raw url
      }
      const title = stripHtml(match[2] || '');
      const content = stripHtml(match[3] || '');
      if (!title && !content) continue;
      out.push({ title: title || 'DuckDuckGo result', content, source: 'DuckDuckGo (HTML)', url: url || null });
    }
    return out;
  } catch (error) {
    logger.debug('DuckDuckGo HTML search failed', { error: String(error) });
    return [];
  }
}

async function searchGoogleNewsRss(query: string, logger: SearchLogger): Promise<EditorialSource[]> {
  try {
    const res = await timedFetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=da&gl=DK&ceid=DK:da`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AproposBot/1.0)' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const out: EditorialSource[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null = null;
    while ((match = itemRe.exec(xml)) !== null && out.length < 8) {
      const item = match[1] || '';
      const title = stripHtml((item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1] || item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').trim());
      const link = stripHtml((item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '').trim());
      const description = stripHtml((item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)?.[1] || item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '').trim());
      const source = stripHtml((item.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || 'Google News').trim());
      if (!title && !description) continue;
      out.push({ title: title || source, content: description || title, source: `Google News: ${source}`, url: link || null });
    }
    return out;
  } catch (error) {
    logger.debug('Google News RSS search failed', { error: String(error) });
    return [];
  }
}

export async function performSourceSearch(
  query: string,
  options: { maxResults?: number; strategy?: string; logger?: SearchLogger } = {}
): Promise<EditorialSource[]> {
  const maxResults = Math.max(1, Math.min(20, options.maxResults || 5));
  const strategy = options.strategy || 'exact';
  const logger = options.logger || noopLogger;
  const [googleResults, googleNewsResults, wikiResults, ddgHtmlResults, ddgResults] = await Promise.all([
    searchGoogle(query, logger),
    searchGoogleNewsRss(query, logger),
    searchWikipedia(query, logger),
    searchDuckDuckGoHtml(query, logger),
    searchDuckDuckGo(query, logger),
  ]);
  return dedupeSources([...googleResults, ...googleNewsResults, ...wikiResults, ...ddgHtmlResults, ...ddgResults])
    .map((source) => enrichSource(source, strategy))
    .filter((source) => source.title || source.content)
    .slice(0, maxResults);
}

export async function performMultiStrategySearch(
  queries: Array<{ query: string; strategy: string }>,
  options: { maxResults?: number; logger?: SearchLogger } = {}
): Promise<EditorialSource[]> {
  const maxResults = Math.max(1, Math.min(30, options.maxResults || 8));
  const primaryQueries = queries.slice(0, 2);
  const openAiBatches = await Promise.all(
    primaryQueries.map(async (item) => {
      try {
        const result = await getResearch(item.query, { maxResults });
        return result.sources.map((source) => enrichSource({
          title: source.title,
          content: source.snippet,
          source: `ChatGPT websearch: ${source.source}`,
          url: source.url,
        }, `chatgpt-${item.strategy}`));
      } catch (error) {
        options.logger?.debug('ChatGPT websearch failed', { error: String(error), query: item.query });
        return [];
      }
    })
  );
  const legacyBatches = await Promise.all(
    queries.slice(0, 6).map((item) => performSourceSearch(item.query, {
      maxResults: Math.max(4, maxResults),
      strategy: item.strategy,
      logger: options.logger,
    }))
  );
  const merged = [...openAiBatches.flat(), ...legacyBatches.flat()];
  return dedupeSources(merged)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, maxResults);
}

