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
    // Try multiple search approaches
    
    // 1. Try DuckDuckGo Instant Answer API
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
    
    // 2. Try Wikipedia API as fallback
    try {
      const wikiUrl = `https://da.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
      const wikiResponse = await fetch(wikiUrl);
      
      if (wikiResponse.ok) {
        const wikiData = await wikiResponse.json();
        
        if (wikiData.extract) {
          results.push({
            title: wikiData.title || 'Wikipedia',
            content: wikiData.extract,
            source: 'Wikipedia',
            url: wikiData.content_urls?.desktop?.page
          });
        }
      }
    } catch (error) {
      console.log('Wikipedia search failed:', error);
    }
    
    // 3. If still no results, create contextual guidance
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
