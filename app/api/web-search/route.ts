import { NextRequest, NextResponse } from 'next/server';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

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

    // Use a more reliable search approach with multiple sources
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

async function performWebSearch(query: string, maxResults: number, logger: ReturnType<typeof createRequestLogger>): Promise<any[]> {
  const results = [];
  
  try {
    // Try multiple search approaches in parallel for faster results
    
    // 1. Wikipedia API (both Danish and English) - highest priority
    const wikiPromises = [
      fetch(`https://da.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`).catch(() => null),
      fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`).catch(() => null)
    ];
    
    try {
      const [wikiDaResponse, wikiEnResponse] = await Promise.all(wikiPromises);
      
      // Prefer Danish Wikipedia
      if (wikiDaResponse?.ok) {
        const wikiDaData = await wikiDaResponse.json();
        if (wikiDaData.extract) {
          results.push({
            title: wikiDaData.title || 'Wikipedia',
            content: wikiDaData.extract,
            source: 'Wikipedia (Dansk)',
            url: wikiDaData.content_urls?.desktop?.page
          });
        }
      } else if (wikiEnResponse?.ok) {
        const wikiEnData = await wikiEnResponse.json();
        if (wikiEnData.extract) {
          results.push({
            title: wikiEnData.title || 'Wikipedia',
            content: wikiEnData.extract,
            source: 'Wikipedia (English)',
            url: wikiEnData.content_urls?.desktop?.page
          });
        }
      }
    } catch (error) {
      logger.debug('Wikipedia search failed', { error: String(error) });
    }
    
    // 2. DuckDuckGo Instant Answer API
    try {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const ddgResponse = await fetch(ddgUrl);
      
      if (ddgResponse.ok) {
        const ddgData = await ddgResponse.json();
        
        if (ddgData.Abstract) {
          results.push({
            title: ddgData.Heading || 'Abstract',
            content: ddgData.Abstract,
            source: 'DuckDuckGo',
            url: ddgData.AbstractURL
          });
        }
        
        if (ddgData.Definition) {
          results.push({
            title: 'Definition',
            content: ddgData.Definition,
            source: 'DuckDuckGo',
            url: ddgData.DefinitionURL
          });
        }
      }
    } catch (error) {
      logger.debug('DuckDuckGo search failed', { error: String(error) });
    }
    
    // 3. Wikipedia Search API (for finding related articles)
    try {
      const wikiSearchUrl = `https://da.wikipedia.org/api/rest_v1/page/search/${encodeURIComponent(query)}?limit=3`;
      const wikiSearchResponse = await fetch(wikiSearchUrl);
      
      if (wikiSearchResponse.ok) {
        const wikiSearchData = await wikiSearchResponse.json();
        if (wikiSearchData.pages && Array.isArray(wikiSearchData.pages)) {
          for (const page of wikiSearchData.pages.slice(0, 2)) {
            // Skip if we already have this page
            if (!results.some(r => r.title === page.title)) {
              try {
                const pageSummaryUrl = `https://da.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.title)}`;
                const pageSummaryResponse = await fetch(pageSummaryUrl);
                if (pageSummaryResponse.ok) {
                  const pageSummary = await pageSummaryResponse.json();
                  if (pageSummary.extract) {
                    results.push({
                      title: pageSummary.title || 'Wikipedia',
                      content: pageSummary.extract.substring(0, 500),
                      source: 'Wikipedia (Dansk)',
                      url: pageSummary.content_urls?.desktop?.page
                    });
                  }
                }
              } catch (error) {
                // Skip this page
              }
            }
          }
        }
      }
    } catch (error) {
      logger.debug('Wikipedia search API failed', { error: String(error) });
    }
    
    // 4. If still no results, create contextual guidance
    if (results.length === 0) {
      results.push({
        title: 'Research Guidance',
        content: `For at skrive en dybdegående artikel om "${query}", anbefaler jeg at du:\n\n1. Specificerer hvilke aspekter du vil fokusere på\n2. Nævner konkrete data eller statistikker du kender\n3. Beskriver din vinkel eller tilgang til emnet\n\nDette hjælper mig med at skrive en mere præcis og faktuel artikel.`,
        source: 'AI Guidance',
        url: null
      });
    }
    
  } catch (error) {
    logger.error('Search failed', error instanceof Error ? error : new Error(String(error)));
  }
  
  return results.slice(0, maxResults);
}
