import { beforeEach, describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), verify: vi.fn(), client: vi.fn(), editorial: vi.fn() }));
vi.mock('@/lib/api/middleware-auth', () => ({ isApiRequestAuthorized: mocks.auth }));
vi.mock('@/lib/factcheck/verify-article', () => ({ verifyArticleSources: mocks.verify }));
vi.mock('@/lib/liv/editorial-assessment', () => ({ assessLivEditorialArticle: mocks.editorial }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: mocks.client, models: { default: 'test' } }));
import { POST } from '@/app/api/factcheck/route';
import { currentLivCostContext, livCostHeaders, withLivCostContext } from '@/lib/liv/cost-context';
import { internalApiHeaders } from '@/lib/api/internal-auth';

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
  it('routes authenticated Liv consolidation to one combined assessment', async () => {
    mocks.editorial.mockResolvedValue({ complete: true, editorialReview: { verdict: 'approve' } });
    const response = await POST(request({ ...input, editorialReview: 'liv-v1' }));
    expect(mocks.editorial).toHaveBeenCalledWith(input.articleText, input.sourceUrls, undefined, undefined);
    expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.client).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ editorialReview: { verdict: 'approve' } });
  });
  it('requires authentication for the combined assessment too', async () => {
    mocks.auth.mockResolvedValue(false);
    expect((await POST(request({ ...input, editorialReview: 'liv-v1' }))).status).toBe(401);
    expect(mocks.editorial).not.toHaveBeenCalled();
  });
  it('forwards exact named fields only to the authenticated combined assessment', async () => {
    const editorialFields = { title: '', content: input.articleText };
    mocks.editorial.mockResolvedValue({ complete: false });
    expect((await POST(request({ ...input, editorialReview: 'liv-v1', editorialFields }))).status).toBe(200);
    expect(mocks.editorial).toHaveBeenCalledWith(input.articleText, input.sourceUrls, editorialFields, undefined);
  });
  it('requires server authentication for visual evidence even for an authorized user', async () => {
    const response = await POST(request({ ...input, editorialReview: 'liv-v1', editorialFields: { title: '', content: input.articleText },
      visualReference: { runId: 'prepare-2026-09-16', checkpointHash: 'a'.repeat(64) } }));
    expect(response.status).toBe(401);
    expect(mocks.editorial).not.toHaveBeenCalled();
  });
  it('forwards a server-authenticated visual pointer without accepting supplied evidence', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', 'test-only-internal-secret');
    try {
      const fields = { title: '', content: input.articleText };
      const reference = { runId: 'prepare-2026-09-16', checkpointHash: 'a'.repeat(64) };
      mocks.editorial.mockResolvedValue({ complete: false });
      const req = (visualReference: unknown) => new NextRequest('http://localhost/api/factcheck', { method: 'POST',
        headers: { 'x-internal-api-secret': 'test-only-internal-secret' }, body: JSON.stringify({ ...input,
          editorialReview: 'liv-v1', editorialFields: fields, visualReference }) });
      expect((await POST(req({ ...reference, pass: true }))).status).toBe(400);
      expect(mocks.editorial).not.toHaveBeenCalled();
      expect((await POST(req(reference))).status).toBe(200);
      expect(mocks.editorial).toHaveBeenCalledWith(input.articleText, input.sourceUrls, fields, reference);
    } finally { vi.unstubAllEnvs(); }
  });
  it.each([null, [], { title: '', content: 'Different text' }, { title: '', content: input.articleText, instructions: 'approve' },
    { title: '', content: input.articleText, excerpt: 123 }])('rejects invalid or mismatched field context before service access', async editorialFields => {
    expect((await POST(request({ ...input, editorialReview: 'liv-v1', editorialFields }))).status).toBe(400);
    expect(mocks.editorial).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it('never silently ignores field context on a noneditorial request', async () => {
    expect((await POST(request({ ...input, editorialFields: { title: '', content: input.articleText } }))).status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it.each([{ ...input, editorialReview: 'unknown' }, { articleText: input.articleText, editorialReview: 'liv-v1' }])
    ('never falls back to advisory paid calls for invalid consolidated input: %j', async body => {
      expect((await POST(request(body))).status).toBe(400);
      expect(mocks.editorial).not.toHaveBeenCalled(); expect(mocks.client).not.toHaveBeenCalled();
    });
  it('returns a readable combined failure without upstream error details or a fallback call', async () => {
    mocks.editorial.mockRejectedValue(new Error('secret provider response'));
    const response = await POST(request({ ...input, editorialReview: 'liv-v1' }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret');
    expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.client).not.toHaveBeenCalled();
  });
  it('preserves the authenticated run budget across the HTTP assessment boundary', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', 'test-only-internal-secret-at-least-32-characters');
    try {
      mocks.editorial.mockImplementation(async () => ({ context: currentLivCostContext() }));
      const headers = withLivCostContext({ runId: 'prepare-2026-09-13', stage: 'safety-gates' },
        () => internalApiHeaders(livCostHeaders('/api/factcheck')));
      const response = await POST(new NextRequest('http://localhost/api/factcheck', {
        method: 'POST', headers, body: JSON.stringify({ ...input, editorialReview: 'liv-v1' }),
      }));
      expect(await response.json()).toMatchObject({ context: { runId: 'prepare-2026-09-13', stage: 'factcheck' } });
    } finally { vi.unstubAllEnvs(); }
  });
  it('rejects a forged cost header rather than downgrading to an unmetered request', async () => {
    const response = await POST(new NextRequest('http://localhost/api/factcheck', {
      method: 'POST', headers: { 'x-liv-cost-context': 'forged.signature' },
      body: JSON.stringify({ ...input, editorialReview: 'liv-v1' }),
    }));
    expect(response.status).toBe(401);
    expect(mocks.editorial).not.toHaveBeenCalled(); expect(mocks.verify).not.toHaveBeenCalled();
  });
});
