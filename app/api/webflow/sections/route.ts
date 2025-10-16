import { NextResponse } from 'next/server';
import { getArticlesCollectionFieldsDetailed } from '@/lib/webflow-service';
import { getWebflowConfig } from '@/lib/webflow-config';
import { fetchCollectionItemsWithFallback, normalizeItems, listCollections, norm } from '../_lib';
import { apiCache, CACHE_TTL } from '@/lib/cache';

export async function GET() {
  try {
    const cacheKey = 'webflow:sections';
    
    // Try to get from cache first
    const cached = apiCache.get<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' } });
    }
    
    const cfg = getWebflowConfig();
    const token = cfg.apiToken || process.env.WEBFLOW_API_TOKEN;
    const siteId = cfg.siteId || process.env.WEBFLOW_SITE_ID;
    const col = process.env.WEBFLOW_SECTIONS_COLLECTION_ID;
    let debug: any = { env: { hasToken: !!token, siteId, col }, tried: [] as any[] };
    if (!token || !siteId) return NextResponse.json({ items: [], debug });

    async function fetchItemsByCollectionId(collectionId: string) {
      const j = await fetchCollectionItemsWithFallback(collectionId);
      const items = normalizeItems(j, ['name','title','label','section','category']);
      const sampleKeys = Array.isArray(j.items) && j.items[0] ? Object.keys(j.items[0]?.fieldData||{}) : [];
      return { items, debug: { ...(j.__debug||{}), sampleKeys, count: (j.items||[]).length } };
    }

    let items: any[] = [];

    if (col) {
      try {
        const r = await fetchItemsByCollectionId(col);
        items = r.items;
        debug.tried.push({ type: 'envId', id: col, ...((r.debug)||{}) });
      } catch {}
    }

    // Fallback: auto-discover a likely sections/categories collection
    if (!items.length) {
      try {
        const cols = await listCollections();
        const cand = cols.find(c => {
          const slug = norm(c.slug);
          const name = norm(c.name);
          return slug.includes('section') || name.includes('section') || slug.includes('sektion') || name.includes('sektion') || slug.includes('category') || name.includes('category') || slug.includes('kategor') || name.includes('kategor');
        });
        if (cand?.id) {
          const r = await fetchItemsByCollectionId(cand.id);
          items = r.items;
          debug.tried.push({ type: 'discovered', id: cand.id, ...((r.debug)||{}) });
        }
      } catch {}
    }

    // Fallback 2: infer from Articles schema (reference or options)
    if (!items.length) {
      try {
        const fields = await getArticlesCollectionFieldsDetailed();
        const norm = (s?: string) => (s || '').toLowerCase();
        const cand = fields.find(f => norm(f.slug).includes('section') || norm(f.slug).includes('category'));
        const colId = cand?.reference?.collectionId;
        if (colId) {
          const r = await fetchItemsByCollectionId(colId);
          items = r.items;
          debug.tried.push({ type: 'inferredRef', field: cand?.slug, id: colId, ...((r.debug)||{}) });
        } else if (Array.isArray(cand?.options) && cand!.options!.length) {
          items = cand!.options!.map((o:any)=> ({ id: o.id || o.slug || o.name, name: o.name || o.slug, slug: (o.slug || (o.name||'').toLowerCase().replace(/\s+/g,'-')) }));
          debug.tried.push({ type: 'inferredOptions', field: cand?.slug, count: items.length });
        }
      } catch {}
    }

    const result = { items, debug };
    
    // Store in cache for 15 minutes
    apiCache.set(cacheKey, result, CACHE_TTL.LONG);
    
    return NextResponse.json(result, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' } });
  } catch (e:any) {
    return NextResponse.json({ items: [] }, { headers: { 'Cache-Control': 's-maxage=60' } });
  }
}


