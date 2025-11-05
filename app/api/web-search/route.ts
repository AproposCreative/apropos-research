import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { query, maxResults = 5 } = await request.json();

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Use a more reliable search approach with multiple sources
    const searchResults = await performWebSearch(query, maxResults);

    return NextResponse.json({
      success: true,
      query,
      results: searchResults,
      totalResults: searchResults.length
    });

  } catch (error) {
    console.error('Web search error:', error);
    return NextResponse.json(
      { error: 'Failed to perform web search' },
      { status: 500 }
    );
  }
}

async function performWebSearch(query: string, maxResults: number): Promise<any[]> {
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
      console.log('Wikipedia search failed:', error);
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
      console.log('DuckDuckGo search failed:', error);
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
      console.log('Wikipedia search API failed:', error);
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
    console.error('Search failed:', error);
  }
  
  return results.slice(0, maxResults);
}
