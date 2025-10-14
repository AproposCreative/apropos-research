import { getWebflowConfig } from '@/lib/webflow-config';

export type WebflowOption = { id: string; name: string; slug: string };

export function getAuthAndSite() {
  const cfg = getWebflowConfig();
  const token = cfg.apiToken || process.env.WEBFLOW_API_TOKEN;
  const siteId = cfg.siteId || process.env.WEBFLOW_SITE_ID;
  return { token, siteId } as const;
}

export async function fetchCollectionItemsWithFallback(collectionId: string) {
  const { token, siteId } = getAuthAndSite();
  if (!token || !siteId) return { items: [], debug: { reason: 'missing token/siteId' } } as any;

  const headers = { 'Authorization': `Bearer ${token}`, 'Accept-Version': '1.0.0' } as const;

  const urlA = `https://api.webflow.com/v2/sites/${siteId}/collections/${collectionId}/items?limit=200`;
  const resA = await fetch(urlA, { headers });
  let j: any = await resA.json().catch(() => ({ items: [] }));
  if (!resA.ok || !(j.items || []).length) {
    const urlB = `https://api.webflow.com/v2/collections/${collectionId}/items?limit=200`;
    const resB = await fetch(urlB, { headers });
    j = await resB.json().catch(() => ({ items: [] }));
    j.__debug = { primaryUrl: urlA, primaryStatus: resA.status, secondaryUrl: urlB, secondaryStatus: resB.status };
    if (!(j.items || []).length) {
      const urlC = `https://api.webflow.com/collections/${collectionId}/items?limit=200&live=false`;
      const resC = await fetch(urlC, { headers: { ...headers, 'accept-version': '1.0.0' } as any });
      const jC: any = await resC.json().catch(() => ({ items: [] }));
      if ((jC.items || []).length) {
        j = { items: jC.items, __debug: { ...(j.__debug || {}), legacyUrl: urlC, legacyStatus: resC.status } };
      } else {
        j.__debug = { ...(j.__debug || {}), legacyUrl: urlC, legacyStatus: resC.status };
      }
    }
  }
  return j;
}

export function mapDisplayName(fieldData: any, candidates: string[] = ['name', 'title', 'label']): string {
  for (const k of candidates) {
    if (typeof fieldData?.[k] === 'string' && fieldData[k]) return fieldData[k];
  }
  for (const k of Object.keys(fieldData || {})) {
    if (typeof fieldData[k] === 'string' && fieldData[k]) return fieldData[k];
  }
  return '';
}

export function normalizeItems(j: any, nameCandidates?: string[]): WebflowOption[] {
  const items = Array.isArray(j?.items) ? j.items : [];
  return items.map((it: any) => ({
    id: it.id,
    name: mapDisplayName(it.fieldData || {}, nameCandidates),
    slug: it.fieldData?.slug || ''
  }));
}

export async function listCollections(): Promise<any[]> {
  const { token, siteId } = getAuthAndSite();
  if (!token || !siteId) return [];
  const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept-Version': '1.0.0' },
  });
  if (!res.ok) return [];
  const data: any = await res.json().catch(() => ({}));
  return Array.isArray(data) ? data : (data.collections || data.items || []);
}

export function norm(s?: string) { return (s || '').toLowerCase(); }


