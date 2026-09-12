import { stripHtml } from './field-mapping';

export type WebflowAuthorItem = {
  id: string; slug?: string; cmsLocaleId?: string;
  fieldData: Record<string, any>;
};

/** Both author APIs prefer the actual CMS field, without a Liv-only override. */
export function webflowAuthorTov(fields: Record<string, unknown>): string {
  for (const key of ['author-prompt', 'authorPrompt', 'author-tov', 'tov', 'toneOfVoice']) {
    const value = fields[key];
    if (typeof value !== 'string') continue;
    const text = stripHtml(value).trim();
    if (text) return text;
  }
  return '';
}

/** Read-only collection endpoint, bounded to 1,000 authors and ten requests. */
export async function fetchWebflowAuthorItems(input: {
  token: string; collectionId: string; localeId?: string;
}): Promise<WebflowAuthorItem[]> {
  if (!/^[a-f0-9]{24}$/i.test(input.collectionId) ||
    (input.localeId && !/^[a-f0-9]{24}$/i.test(input.localeId))) throw new Error('webflow_authors_invalid_configuration');
  const authors: WebflowAuthorItem[] = [];
  const seen = new Set<string>();
  let offset = 0;
  for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
    const query = new URLSearchParams({ limit: '100', offset: String(offset) });
    if (input.localeId) query.set('cmsLocaleId', input.localeId);
    const response = await fetch(`https://api.webflow.com/v2/collections/${input.collectionId}/items?${query}`, {
      headers: { Authorization: `Bearer ${input.token}`, Accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`webflow_authors_http_${response.status}`);
    const page = await response.json();
    if (!Array.isArray(page.items) || page.items.length > 100) throw new Error('webflow_authors_invalid_response');
    for (const item of page.items) {
      if (!item || typeof item.id !== 'string' || !item.fieldData || typeof item.fieldData !== 'object' ||
        Array.isArray(item.fieldData)) throw new Error('webflow_authors_invalid_response');
      if (input.localeId && item.cmsLocaleId && item.cmsLocaleId !== input.localeId) continue;
      const key = `${item.id}:${item.cmsLocaleId || ''}`;
      if (seen.has(key)) continue;
      seen.add(key); authors.push(item);
    }
    const total = page.pagination?.total;
    offset += page.items.length;
    if (Number.isInteger(total) && total >= 0) {
      if (offset >= total) return authors;
      if (!page.items.length) throw new Error('webflow_authors_incomplete_response');
    } else if (page.items.length < 100) return authors;
  }
  // Do not present a silently truncated collection as all authors.
  throw new Error('webflow_authors_page_limit');
}
