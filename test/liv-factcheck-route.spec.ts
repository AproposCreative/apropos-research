import { beforeEach, describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), verify: vi.fn(), client: vi.fn() }));
vi.mock('@/lib/api/middleware-auth', () => ({ isApiRequestAuthorized: mocks.auth }));
vi.mock('@/lib/factcheck/verify-article', () => ({ verifyArticleSources: mocks.verify }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: mocks.client, models: { default: 'test' } }));
import { POST } from '@/app/api/factcheck/route';

const input = { articleText: 'En kulturartikel med faktuelle påstande.', sourceUrls: ['https://museum.dk/nyhed'] };
const request = (body: unknown) => new NextRequest('http://localhost/api/factcheck', { method: 'POST', body: JSON.stringify(body) });
describe('factcheck route', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); });
  it('rejects unauthenticated calls before any source or model access', async () => {
    mocks.auth.mockResolvedValue(false);
    expect((await POST(request(input))).status).toBe(401);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each([null, [], 'text', { ...input, sourceUrls: [] }, { ...input, articleText: 'x'.repeat(40001) }])('rejects invalid input %j', async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it('returns JSON for malformed request bodies', async () => {
    const response = await POST(new NextRequest('http://localhost/api/factcheck', { method: 'POST', body: '{' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeTruthy();
  });
  it('uses the grounded service and disables response caching', async () => {
    mocks.verify.mockResolvedValue({ complete: false, blockers: ['Manglende belæg'] });
    const response = await POST(request(input));
    expect(mocks.verify).toHaveBeenCalledWith(input.articleText, input.sourceUrls);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).complete).toBe(false);
  });
  it('fails closed without exposing provider messages', async () => {
    mocks.verify.mockRejectedValue(new Error('secret provider details'));
    const response = await POST(request(input));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain('secret');
    expect(JSON.parse(body).complete).toBe(false);
  });
});
