import { NextResponse } from 'next/server';
import { getWebflowAuthors } from '@/lib/webflow-service';
import { apiCache, CACHE_TTL } from '@/lib/cache';

export async function GET() {
  try {
    const cacheKey = 'webflow:authors';
    
    // Try to get from cache first
    const cached = apiCache.get<any>(cacheKey);
    if (cached) {
      return NextResponse.json({ authors: cached, cached: true });
    }
    
    // If not in cache, fetch from Webflow
    const authors = await getWebflowAuthors();
    
    // Store in cache for 15 minutes (authors don't change often)
    apiCache.set(cacheKey, authors, CACHE_TTL.LONG);
    
    return NextResponse.json({ authors, cached: false });
  } catch (error) {
    console.error('Error fetching Webflow authors:', error);
    return NextResponse.json(
      { error: 'Failed to fetch authors' },
      { status: 500 }
    );
  }
}
