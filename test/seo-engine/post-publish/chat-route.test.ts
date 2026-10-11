import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ access: vi.fn(), claim: vi.fn(), get: vi.fn(), save: vi.fn(), apply: vi.fn(), activate: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: m.access }));
vi.mock('@/lib/seo-engine/post-publish/chat', () => ({ claimSeoTasks: m.claim, getSeoTask: m.get, saveSeoReview: m.save, applySeoReview: m.apply, activateChatSeo: m.activate }));
vi.mock('@/lib/seo-engine/post-publish/processor', () => ({ seoProcessorMode: async () => 'api' }));
import { GET, POST } from '../../../app/api/seo-engine/chat/route';
const request = (data: unknown) => new NextRequest('https://ai.aproposmagazine.com/api/seo-engine/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
beforeEach(() => { vi.clearAllMocks(); m.access.mockResolvedValue({ uid: 'owner', owner: true }); });
it('requires verified owner auth for both read and write', async () => {
  m.access.mockResolvedValue({ uid: 'member', owner: false });
  expect((await GET(request(null))).status).toBe(403); expect((await POST(request({ action: 'apply', input: {} }))).status).toBe(403);
  expect(m.apply).not.toHaveBeenCalled();
});
it('passes only authenticated identity and prevents caller override', async () => {
  m.claim.mockResolvedValue({ tasks: [] });
  const response = await POST(request({ action: 'claim', input: { requestId: 'test-claim-1' } }));
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(m.claim).toHaveBeenCalledExactlyOnceWith('owner', { requestId: 'test-claim-1' });
  expect((await POST(request({ action: 'claim', input: {}, uid: 'another-owner' }))).status).toBe(409);
});
it('sanitizes unknown failures without exposing signed URLs or credentials', async () => {
  m.get.mockRejectedValue(Error('secret remote url'));
  const response = await GET(new NextRequest('https://ai.aproposmagazine.com/api/seo-engine/chat?taskId=task'));
  expect(response.status).toBe(409); expect(JSON.stringify(await response.json())).not.toContain('secret remote');
});
it('forwards conditional context hash only for the authenticated owner and keeps responses private', async () => {
  m.get.mockResolvedValue({ context: null, contextIncluded: false, contextHash: 'a'.repeat(64) });
  const response = await GET(new NextRequest('https://ai.aproposmagazine.com/api/seo-engine/chat?taskId=task&knownContextHash=' + 'a'.repeat(64)));
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(m.get).toHaveBeenCalledExactlyOnceWith('owner', 'task', 'a'.repeat(64));
  expect((await response.json()).contextIncluded).toBe(false);
});
