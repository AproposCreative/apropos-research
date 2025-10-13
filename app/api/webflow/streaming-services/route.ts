import { NextResponse } from 'next/server';
import { getWebflowConfig } from '@/lib/webflow-config';

export async function GET() {
  try {
    const cfg = getWebflowConfig();
    const token = cfg.apiToken || process.env.WEBFLOW_API_TOKEN;
    const siteId = cfg.siteId || process.env.WEBFLOW_SITE_ID;
    const col = process.env.WEBFLOW_STREAMING_SERVICES_COLLECTION_ID;
    if (!token || !siteId) return NextResponse.json({ items: [] });
    const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections/${col}/items?limit=200`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept-Version': '1.0.0' },
    });
    let j:any = await res.json().catch(()=>({items:[]}));
    if (!res.ok || !(j.items||[]).length) {
      const resB = await fetch(`https://api.webflow.com/v2/collections/${col}/items?limit=200`, { headers: { 'Authorization': `Bearer ${token}`, 'Accept-Version': '1.0.0' } });
      j = await resB.json().catch(()=>({items:[]}));
    }
    const mapName = (fd:any) => {
      for (const k of ['name','title','label','service']) if (typeof fd?.[k] === 'string' && fd[k]) return fd[k];
      for (const k of Object.keys(fd||{})) if (typeof fd[k] === 'string' && fd[k]) return fd[k];
      return '';
    };
    const items = (j.items||[]).map((it:any)=>({ id: it.id, name: mapName(it.fieldData||{}), slug: it.fieldData?.slug || '' }));
    return NextResponse.json({ items });
  } catch (e:any) {
    return NextResponse.json({ items: [] });
  }
}


