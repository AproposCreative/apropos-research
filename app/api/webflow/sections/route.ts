import { NextResponse } from 'next/server';
import { getArticlesCollectionFieldsDetailed } from '@/lib/webflow-service';
import { getWebflowConfig } from '@/lib/webflow-config';

export async function GET() {
  try {
    const cfg = getWebflowConfig();
    const token = cfg.apiToken || process.env.WEBFLOW_API_TOKEN;
    const siteId = cfg.siteId || process.env.WEBFLOW_SITE_ID;
    const col = process.env.WEBFLOW_SECTIONS_COLLECTION_ID;
    let debug: any = { env: { hasToken: !!token, siteId, col }, tried: [] as any[] };
    if (!token || !siteId) return NextResponse.json({ items: [], debug });

    async function fetchItemsByCollectionId(collectionId: string) {
      const urlA = `https://api.webflow.com/v2/sites/${siteId}/collections/${collectionId}/items?limit=200`;
      const res = await fetch(urlA, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept-Version': '1.0.0' },
      });
      let j:any = await res.json().catch(()=>({items:[]}));
      if (!res.ok || !(j.items||[]).length) {
        const urlB = `https://api.webflow.com/v2/collections/${collectionId}/items?limit=200`;
        const resB = await fetch(urlB, { headers: { 'Authorization': `Bearer ${token}`, 'Accept-Version': '1.0.0' } });
        j = await resB.json().catch(()=>({items:[], error: 'parse'}));
        j.__debug = { primaryUrl: urlA, primaryStatus: res.status, secondaryUrl: urlB, secondaryStatus: resB.status };
        // Fallback to legacy v1
        if (!(j.items||[]).length) {
          const urlC = `https://api.webflow.com/collections/${collectionId}/items?limit=200&live=false`;
          const resC = await fetch(urlC, { headers: { 'Authorization': `Bearer ${token}`, 'accept-version': '1.0.0' } });
          const jC:any = await resC.json().catch(()=>({items:[]}));
          if ((jC.items||[]).length) {
            j = { items: jC.items, __debug: { ...(j.__debug||{}), legacyUrl: urlC, legacyStatus: resC.status } };
          } else {
            j.__debug = { ...(j.__debug||{}), legacyUrl: urlC, legacyStatus: resC.status };
          }
        }
      }
      const mapName = (fd:any) => {
        const candidates = ['name','title','label','section','category'];
        for (const k of candidates) {
          if (typeof fd?.[k] === 'string' && fd[k]) return fd[k];
        }
        for (const k of Object.keys(fd||{})) {
          if (typeof fd[k] === 'string' && fd[k]) return fd[k];
        }
        return '';
      };
      const items = (j.items||[]).map((it:any)=>({ id: it.id, name: mapName(it.fieldData||{}), slug: it.fieldData?.slug || '' }));
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
        const list = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept-Version': '1.0.0' },
        });
        const data: any = await list.json().catch(()=>({}));
        const cols: any[] = Array.isArray(data) ? data : (data.collections || data.items || []);
        const norm = (s?: string) => (s || '').toLowerCase();
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

    return NextResponse.json({ items, debug });
  } catch (e:any) {
    return NextResponse.json({ items: [] });
  }
}


