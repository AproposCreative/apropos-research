import { NextResponse } from 'next/server';
import { getArticlesCollectionFieldsDetailed } from '@/lib/webflow-service';
import { apiCache, CACHE_TTL } from '@/lib/cache';

export async function GET() {
  try {
    const cacheKey = 'webflow:article-fields';
    
    // Try to get from cache first
    const cached = apiCache.get<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
    
    const fields = await getArticlesCollectionFieldsDetailed();
    const result = { fields };
    
    // Store in cache for 15 minutes (schema rarely changes)
    apiCache.set(cacheKey, result, CACHE_TTL.LONG);
    
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch fields' }, { status: 500 });
  }
}


