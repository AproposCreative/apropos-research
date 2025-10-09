import { NextResponse } from 'next/server';
import { getWebflowConfig } from '@/lib/webflow-config';

export async function GET() {
  try {
    const { apiToken: token, siteId, articlesCollectionId } = getWebflowConfig();
    if (!token || !siteId || !articlesCollectionId) {
      return NextResponse.json({ counts: { total: 0, published: 0, inProgress: 0, pending: 0 } });
    }

    const headers = { 'Authorization': `Bearer ${token}`, 'Accept-Version': '1.0.0' } as any;
    const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections/${articlesCollectionId}/items?limit=1000`, { headers });
    if (!res.ok) throw new Error('Webflow items fetch failed');
    const data: any = await res.json();
    const items: any[] = data.items || [];

    const total = items.length;
    const published = items.filter(i => i.fieldData?.status === 'published').length;
    const inProgress = items.filter(i => i.fieldData?.status === 'in-progress').length;
    const pending = items.filter(i => i.fieldData?.status === 'pending').length;

    return NextResponse.json({ counts: { total, published, inProgress, pending } });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load counts' }, { status: 500 });
  }
}
