import { NextResponse } from 'next/server';
import { getWebflowConfig } from '@/lib/webflow-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { apiToken: token, siteId, articlesCollectionId } = getWebflowConfig();
    if (!token || !siteId || !articlesCollectionId) {
      return NextResponse.json({ items: [] });
    }

    const headers = { 'Authorization': `Bearer ${token}`, 'Accept-Version': '1.0.0' } as any;
    const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections/${articlesCollectionId}/items?limit=50`, { headers });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return NextResponse.json({ error: j?.message || 'Failed to fetch items' }, { status: 502 });
    }
    const data: any = await res.json();
    const items: any[] = data.items || [];

    // Return trimmed fieldData only
    const trimmed = items.map((it) => ({ id: it.id, fieldData: it.fieldData }));
    return NextResponse.json({ items: trimmed });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch samples' }, { status: 500 });
  }
}


