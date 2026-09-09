import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ read: vi.fn(), ingest: vi.fn(), auth: vi.fn(), db: vi.fn() }));
vi.mock('@/lib/trending/firestore-store', () => ({ getRecentTrendingArticles: mocks.read }));
vi.mock('@/lib/trending/ingest-runner', () => ({ runIngestToFirestore: mocks.ingest }));
vi.mock('@/lib/newsletter/auth-request', () => ({ getNewsletterUserIdFromRequest: mocks.auth }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: mocks.db }));
import { GET } from '@/app/api/trending/route';
import { POST } from '@/app/api/refresh/route';
import { resolveTrendingSource, matchesTrendingSource } from '@/lib/trending/source-filter';
beforeEach(() => { vi.resetAllMocks(); mocks.db.mockReturnValue({}); mocks.auth.mockResolvedValue('user-fixture'); });
it.each(['Soundvenue', 'GAFFA', 'BERLINGSKE', 'BT'])('resolves user-scoped %s ID to shared publisher', name => {
  expect(resolveTrendingSource(`USER_${name.toLowerCase()}`, name).id).toBe(name.toLowerCase());
});
it('does not match a lookalike hostname', () => {
  expect(matchesTrendingSource({ source: 'x', url: 'https://soundvenue.com.evil.test/a' }, resolveTrendingSource('soundvenue'))).toBe(false);
});
it('returns the selected publisher catalogue without applying music-centric ranking', async () => {
  mocks.read.mockResolvedValue([{ title: 'En usædvanlig samtale', body_text: 'En dokumenteret tekst uden musiknøgleord. '.repeat(5), source: 'soundvenue', url: 'https://soundvenue.com/a' }]);
  const result = await GET(new NextRequest('https://studio.example/api/trending?view=writer&source=USER_soundvenue&sourceName=Soundvenue'));
  expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ source: 'soundvenue' }));
  expect((await result.json()).articles).toHaveLength(1);
});
it('refresh awaits shared ingestion and never requests pruning', async () => {
  mocks.ingest.mockResolvedValue({ added: 2, updated: 0, unchanged: 0 });
  const response = await POST(new NextRequest('https://studio.example/api/refresh', { method: 'POST', body: JSON.stringify({ source: 'USER_soundvenue', sourceName: 'Soundvenue', limit: 1000 }) }));
  expect(response.status).toBe(200);
  expect(mocks.ingest).toHaveBeenCalledWith({ source: 'soundvenue', limit: 20, sinceHrs: 168 });
});
it('does not report empty ingestion as success', async () => {
  mocks.ingest.mockResolvedValue({ added: 0, updated: 0, unchanged: 0 });
  expect((await POST(new NextRequest('https://studio.example/api/refresh', { method: 'POST', body: '{}' }))).status).toBe(422);
});
it('preserves bodyless refresh and legacy minute-window callers', async () => {
  mocks.ingest.mockResolvedValue({ added: 1, updated: 0, unchanged: 0 });
  expect((await POST(new NextRequest('https://studio.example/api/refresh', { method: 'POST' }))).status).toBe(200);
  expect((await POST(new NextRequest('https://studio.example/api/refresh', { method: 'POST', body: '{"sinceMinutes":10}' }))).status).toBe(200);
  expect(mocks.ingest).toHaveBeenLastCalledWith({ source: undefined, limit: 20, sinceHrs: 1 / 6 });
});
it('rejects malformed JSON and unsupported custom ingestion without writes', async () => {
  expect((await POST(new NextRequest('https://studio.example/api/refresh', { method: 'POST', body: '{' }))).status).toBe(400);
  expect((await POST(new NextRequest('https://studio.example/api/refresh', { method: 'POST', body: '{"source":"custom-media"}' }))).status).toBe(422);
  expect(mocks.ingest).not.toHaveBeenCalled();
});
it('rejects anonymous refresh before database writes', async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await POST(new NextRequest('https://studio.example/api/refresh', { method: 'POST', body: '{}' }))).status).toBe(401);
  expect(mocks.ingest).not.toHaveBeenCalled();
});
