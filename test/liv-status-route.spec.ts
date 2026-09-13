import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), history: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mocks.auth }));
vi.mock('@/lib/liv/daily-history-store', () => ({ listRecentLivDaily: mocks.history }));
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({ apiToken: 'fixture', siteId: 'site', articlesCollectionId: 'articles' }) }));
import { GET } from '@/app/api/liv/status/route';

describe('Liv status evidence and privacy', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ uid: 'editor', owner: true }); mocks.history.mockResolvedValue([]); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('does not read history for an unauthorized caller', async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await GET(new NextRequest('https://example.test/api/liv/status'));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it('requires publication evidence and excludes archived items from published status', async () => {
    const items = [
      { id: 'unpublished', isDraft: false },
      { id: 'published', isDraft: false, lastPublished: '2026-09-13T08:00:00Z' },
      { id: 'archived', isArchived: true, lastPublished: '2026-09-13T08:00:00Z' },
      { id: 'draft', isDraft: true, lastPublished: '2026-09-13T08:00:00Z' },
    ].map(item => ({ ...item, fieldData: { name: item.id, slug: item.id, 'author-name': 'Liv Brandt' } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ items })));
    const response = await GET(new NextRequest('https://example.test/api/liv/status'));
    const body = await response.json();
    expect(body.counts).toEqual({ draft: 2, published: 1, archived: 1 });
    expect(body.config.cronNote).toContain('10 Europe/Copenhagen');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('redacts upstream exception details', async () => {
    mocks.history.mockRejectedValue(new Error('private upstream credential fixture'));
    const response = await GET(new NextRequest('https://example.test/api/liv/status?includeCms=0'));
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ error: 'Kunne ikke hente Livs udgivelsesstatus' });
  });
  it('returns only publication fields to colleagues, excluding draft and runtime details', async () => {
    mocks.auth.mockResolvedValue({ uid: 'milo', owner: false });
    mocks.history.mockResolvedValue([
      { id: 'published', status: 'published', title: 'Artikel', slug: 'artikel', reason: 'private', gateResults: ['private'] },
      { id: 'draft', status: 'draft', title: 'Private draft' },
    ]);
    const response = await GET(new NextRequest('https://example.test/api/liv/status?includeCms=0'));
    expect(await response.json()).toEqual({ ok: true, entries: [{ id: 'published', status: 'published', title: 'Artikel', slug: 'artikel' }] });
  });
});
