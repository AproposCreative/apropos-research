import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const token = process.env.WEBFLOW_API_TOKEN;
    const siteId = process.env.WEBFLOW_SITE_ID;
    const col = process.env.WEBFLOW_FESTIVALS_COLLECTION_ID;
    if (!token || !siteId || !col) return NextResponse.json({ items: [] });
    const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections/${col}/items?limit=200`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept-Version': '1.0.0' },
    });
    const j:any = await res.json().catch(()=>({items:[]}));
    const items = (j.items||[]).map((it:any)=>({ id: it.id, name: it.fieldData?.name || it.fieldData?.title || '', slug: it.fieldData?.slug || '' }));
    return NextResponse.json({ items });
  } catch (e:any) {
    return NextResponse.json({ items: [] });
  }
}


