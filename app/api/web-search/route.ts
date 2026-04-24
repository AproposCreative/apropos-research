import { NextRequest, NextResponse } from 'next/server';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

interface SearchResult {
  title: string;
  content: string;
  source: string;
  url: string | null;
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  let query: string | undefined;
  
  try {
    const requestBody = await request.json();
    const { query: reqQuery, maxResults = 5 } = requestBody;
    query = reqQuery;

    if (!query) {
      requestLogger.warn('Missing query in request');
      return NextResponse.json(
        createErrorResponse('Query is required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    const searchResults = await performWebSearch(query, maxResults, requestLogger);

    requestLogger.info('Web search completed', {
      query,
      resultsCount: searchResults.length,
    });

    return NextResponse.json(
      createSuccessResponse({
        query,
        results: searchResults,
        totalResults: searchResults.length
      }, { requestId })
    );

  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Web search error', errorObj, { query: query || 'unknown' });
    return NextResponse.json(
      createErrorResponse('Failed to perform web search', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}

async function searchGoogle(query: string, logger: ReturnType<typeof createRequestLogger>): Promise<SearchResult[]> {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
  if (!apiKey || !cx) return [];

  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=5&lr=lang_da|lang_en`;
    const res = await fetch(url);
    if (!res.ok) {
      logger.debug('Google Custom Search failed', { status: res.status });
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

async function searchWikipedia(query: string, logger: ReturnType<typeof createRequestLogger>): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  const [wikiDaResponse, wikiEnResponse] = await Promise.all([
    fetch(`https://da.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`).catch(() => null),
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`).catch(() => null),
  ]);

  try {
    if (wikiDaResponse?.ok) {
      const d = await wikiDaResponse.json();
      if (d.extract) results.push({ title: d.title || 'Wikipedia', content: d.extract, source: 'Wikipedia (Dansk)', url: d.content_urls?.desktop?.page || null });
    }
    if (wikiEnResponse?.ok) {
      const d = await wikiEnResponse.json();
      if (d.extract && !results.some(r => r.title === d.title)) {
        results.push({ title: d.title || 'Wikipedia', content: d.extract, source: 'Wikipedia (English)', url: d.content_urls?.desktop?.page || null });
      }
    }
  } catch (error) {
    logger.debug('Wikipedia search failed', { error: String(error) });
  }

  try {
    const searchRes = await fetch(`https://da.wikipedia.org/api/rest_v1/page/search/${encodeURIComponent(query)}?limit=3`);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      for (const page of (searchData.pages || []).slice(0, 2)) {
        if (results.some(r => r.title === page.title)) continue;
        try {
          const summaryRes = await fetch(`https://da.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.title)}`);
          if (summaryRes.ok) {
            const s = await summaryRes.json();
            if (s.extract) results.push({ title: s.title || 'Wikipedia', content: s.extract.substring(0, 500), source: 'Wikipedia (Dansk)', url: s.content_urls?.desktop?.page || null });
          }
        } catch { /* skip */ }
      }
    }
  } catch (error) {
    logger.debug('Wikipedia search API failed', { error: String(error) });
  }

  return results;
}

async function searchDuckDuckGo(query: string, logger: ReturnType<typeof createRequestLogger>): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(ddgUrl);
    if (res.ok) {
      const d = await res.json();
      if (d.Abstract) results.push({ title: d.Heading || 'Abstract', content: d.Abstract, source: 'DuckDuckGo', url: d.AbstractURL || null });
      if (d.Definition) results.push({ title: 'Definition', content: d.Definition, source: 'DuckDuckGo', url: d.DefinitionURL || null });
    }
  } catch (error) {
    logger.debug('DuckDuckGo search failed', { error: String(error) });
  }
  return results;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

async function searchDuckDuckGoHtml(query: string, logger: ReturnType<typeof createRequestLogger>): Promise<SearchResult[]> {
  try {
    const res = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AproposBot/1.0)',
      },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const out: SearchResult[] = [];
    const resultRe =
      /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null = null;
    while ((m = resultRe.exec(html)) !== null && out.length < 6) {
      const rawUrl = m[1] || '';
      const title = stripHtml(m[2] || '');
      const snippet = stripHtml(m[3] || '');
      let url = rawUrl;
      try {
        if (rawUrl.startsWith('/')) {
          const u = new URL(`https://duckduckgo.com${rawUrl}`);
          const uddg = u.searchParams.get('uddg');
          if (uddg) url = decodeURIComponent(uddg);
        }
      } catch {
        // keep raw url
      }
      if (!title && !snippet) continue;
      out.push({
        title: title || 'DuckDuckGo result',
        content: snippet || '',
        source: 'DuckDuckGo (HTML)',
        url: url || null,
      });
    }
    return out;
  } catch (error) {
    logger.debug('DuckDuckGo HTML search failed', { error: String(error) });
    return [];
  }
}

async function performWebSearch(query: string, maxResults: number, logger: ReturnType<typeof createRequestLogger>): Promise<SearchResult[]> {
  const seen = new Set<string>();
  const dedup = (items: SearchResult[]): SearchResult[] =>
    items.filter(r => {
      const key = (r.title + r.url).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  // Run all sources in parallel
  const [googleResults, wikiResults, ddgResults, ddgHtmlResults] = await Promise.all([
    searchGoogle(query, logger),
    searchWikipedia(query, logger),
    searchDuckDuckGo(query, logger),
    searchDuckDuckGoHtml(query, logger),
  ]);

  // Google first (richest snippets), then Wikipedia (authoritative), then DuckDuckGo
  const combined = dedup([...googleResults, ...wikiResults, ...ddgHtmlResults, ...ddgResults]);

  if (combined.length === 0) {
    combined.push({
      title: 'Research Guidance',
      content: `Ingen søgeresultater for "${query}". Specificér aspekter, konkrete data eller din vinkel for en mere præcis artikel.`,
      source: 'AI Guidance',
      url: null,
    });
  }

  return combined.slice(0, maxResults);
}
