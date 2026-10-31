import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/config/env', () => ({ env: { WEBFLOW_API_TOKEN: 'fixture-only', WEBFLOW_SITE_ID: 'fixture-site' } }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({}) }));
vi.mock('@/lib/webflow-service', () => ({ getWebflowAuthors: vi.fn() }));
import { fetchNewsletterSignupEmails } from '@/lib/newsletter/webflow-sources';
import { fetchFormSubmissions, fetchNewsletterEmails, listForms } from '@/lib/newsletter/webflow-forms';
const formID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ id: String(i),
  fieldData: { email: `person${i}@example.test` }, formData: { email: `person${i}@example.test` } }));
afterEach(() => vi.unstubAllGlobals());
it('actual CMS enumerator cannot certify its full5000 bound or malformed200; terminal pages can', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: rows(100) })));
  expect((await fetchNewsletterSignupEmails('fixture-cms', 'email')).complete).toBe(false);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  expect((await fetchNewsletterSignupEmails('fixture-cms', 'email')).complete).toBe(false);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: [] })));
  expect((await fetchNewsletterSignupEmails('fixture-cms', 'email')).complete).toBe(true);
  let page = 0;
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: rows(page++ ? 7 : 100) })));
  expect((await fetchNewsletterSignupEmails('fixture-cms', 'email')).complete).toBe(true);
});
it('actual direct forms and forms-list enumerators cannot certify capped or malformed replies', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ formSubmissions: rows(100), forms: rows(100) })));
  expect((await fetchFormSubmissions(formID)).complete).toBe(false);
  expect((await listForms()).complete).toBe(false);
  for (const payload of [{}, { formSubmissions: null, forms: 'not-an-array' }]) {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(payload)));
    expect((await fetchFormSubmissions(formID)).complete).not.toBe(true);
    expect((await listForms()).complete).not.toBe(true);
  }
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ formSubmissions: [] })));
  expect((await fetchFormSubmissions(formID)).complete).toBe(true);
});
it('actual email fallback propagates forms-list and submission receipts, including validempty', async () => {
  const fetcher = (listComplete: boolean) => vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/forms')) return Response.json(listComplete ? { forms: [{ id: formID, displayName: 'Subscribe' }] } : {});
    return Response.json({ formSubmissions: [] });
  });
  vi.stubGlobal('fetch', fetcher(true));
  expect((await fetchNewsletterEmails()).complete).toBe(true);
  vi.stubGlobal('fetch', fetcher(false));
  expect((await fetchNewsletterEmails()).complete).not.toBe(true);
});
it('partial errors after a valid page never become a complete source', async () => {
  let page = 0;
  vi.stubGlobal('fetch', vi.fn(async () => page++ ? Response.json({ message: 'unavailable' }, { status: 503 }) : Response.json({ items: rows(100) })));
  expect((await fetchNewsletterSignupEmails('fixture-cms', 'email')).complete).not.toBe(true);
  page = 0;
  vi.stubGlobal('fetch', vi.fn(async () => page++ ? Response.json({ message: 'unavailable' }, { status: 503 }) : Response.json({ formSubmissions: rows(100) })));
  expect((await fetchFormSubmissions(formID)).complete).not.toBe(true);
});
