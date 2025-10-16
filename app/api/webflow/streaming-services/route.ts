import { NextResponse } from 'next/server';
import { getWebflowConfig } from '@/lib/webflow-config';
import { fetchCollectionItemsWithFallback, normalizeItems } from '../_lib';
import { apiCache, CACHE_TTL } from '@/lib/cache';

export async function GET() {
  try {
    const cacheKey = 'webflow:streaming-services';
    
    // Try to get from cache first
    const cached = apiCache.get<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' } });
    }
    
    const cfg = getWebflowConfig();
    const token = cfg.apiToken || process.env.WEBFLOW_API_TOKEN;
    const siteId = cfg.siteId || process.env.WEBFLOW_SITE_ID;
    const col = process.env.WEBFLOW_STREAMING_SERVICES_COLLECTION_ID;
    if (!token || !siteId) return NextResponse.json({ items: [] });
    const j:any = await fetchCollectionItemsWithFallback(col);
    const items = normalizeItems(j, ['name','title','label','service']);
    
    const result = { items };
    
    // Store in cache for 15 minutes
    apiCache.set(cacheKey, result, CACHE_TTL.LONG);
    
    return NextResponse.json(result, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' } });
  } catch (e:any) {
    return NextResponse.json({ items: [] }, { headers: { 'Cache-Control': 's-maxage=60' } });
  }
}


