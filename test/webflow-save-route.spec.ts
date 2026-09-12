import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { articleSaveFeedback } from '@/lib/articles/save-response';

const mocks = vi.hoisted(() => ({ save: vi.fn(), inspect: vi.fn() }));
vi.mock('@/lib/webflow-service', () => ({ publishArticleToWebflow: mocks.save }));
vi.mock('@/lib/articles/save-receipt', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/articles/save-receipt')>(), inspectArticleSave: mocks.inspect,
}));
vi.mock('@/lib/seo-engine/after-publish', () => ({ maybeEnqueueSeoEngineAfterPublish: vi.fn() }));
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({}) }));
vi.mock('@/lib/logger', () => ({ createRequestLogger: () => ({ info: vi.fn(), warn: vi.fn() }) }));
import { POST } from '@/app/api/webflow/publish/route';

const id = '0123456789abcdef01234567';
const article = { title: 'En rotte i byen', content: '<p>En konkret fortolkning.</p>', slug: 'en-rotte-i-byen', source: 'liv' };
function request(body: string) {
  return new NextRequest('http://localhost/api/webflow/publish', {
    method: 'POST', body, headers: { 'content-type': 'application/json' },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.save.mockResolvedValue(id);
  mocks.inspect.mockResolvedValue({ saveState: 'draft', saveVerified: true, cmsLocaleId: id });
});

describe('Webflow save API, not a live publication endpoint', () => {
  it.each(['', '{', 'null', '[]', '"article"', '42'])('rejects malformed payload %s without saving', async raw => {
    const result = await POST(request(raw));
    expect(result.status).toBe(400);
    expect(await result.json()).toHaveProperty('error');
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([{ title: 7, content: 'body' }, { title: 'title', content: [] }, { title: ' ', content: 'body' }])(
    'rejects invalid required fields %j', async input => {
      expect((await POST(request(JSON.stringify(input)))).status).toBe(400);
      expect(mocks.save).not.toHaveBeenCalled();
    },
  );
  it('rejects an invalid update ID before any upstream call', async () => {
    expect((await POST(request(JSON.stringify({ ...article, webflowId: '../another-item' })))).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('returns a checked draft even when the caller requests published', async () => {
    const response = await POST(request(JSON.stringify({ ...article, status: 'published' })));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }),
      expect.objectContaining({ onBeforeSave: expect.any(Function) }));
    expect(mocks.inspect).toHaveBeenCalledWith({ articleId: id, expected: expect.objectContaining({
      ...article, workflowState: 'webflow_draft', status: 'draft',
    }) });
    expect(result.data).toMatchObject({ articleId: id, saveState: 'draft', publicationVerified: false, publicationBlocked: true });
    expect(articleSaveFeedback(result)).toMatchObject({ articleId: id, publicationVerified: false, label: 'Kladde gemt' });
  });
  it('does not mark an update to an existing live item as a live revision', async () => {
    mocks.inspect.mockResolvedValue({ saveState: 'staged', saveVerified: true });
    const result = await (await POST(request(JSON.stringify({ ...article, webflowId: id })))).json();
    expect(articleSaveFeedback(result)).toMatchObject({ publicationVerified: false, label: 'Ændringer gemt, ikke bekræftet live' });
  });
  it('preserves the CMS ID after a failed readback, without exposing upstream details', async () => {
    mocks.inspect.mockRejectedValue(new Error('PRIVATE_UPSTREAM_DIAGNOSTIC'));
    const response = await POST(request(JSON.stringify(article)));
    const result = await response.json();
    expect(response.status).toBe(502);
    expect(result).toMatchObject({ articleId: id, saveState: 'unverified', publicationVerified: false });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_UPSTREAM_DIAGNOSTIC');
    expect(articleSaveFeedback(result)).toMatchObject({ articleId: id, publicationVerified: false });
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it('does not claim success or automatically retry after an upstream failure', async () => {
    mocks.save.mockRejectedValue(new Error('PRIVATE_UPSTREAM_DIAGNOSTIC'));
    const response = await POST(request(JSON.stringify(article)));
    const result = await response.json();
    expect(response.status).toBe(502);
    expect(result).not.toHaveProperty('articleId');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_UPSTREAM_DIAGNOSTIC');
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it('rejects success without a valid saved item ID', async () => {
    mocks.save.mockResolvedValue(undefined);
    expect((await POST(request(JSON.stringify(article)))).status).toBe(502);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
});

describe('client feedback', () => {
  it.each([null, {}, { articleId: id }, { success: true, data: { articleId: id, message: 'Published successfully' } }])(
    'does not infer publication from a legacy or missing response', response => {
      expect(articleSaveFeedback(response).publicationVerified).toBe(false);
    },
  );
  it('requires an explicit successful live receipt', () => {
    expect(articleSaveFeedback({ success: true, data: { articleId: id, publicationVerified: true, webflowStatus: 'published' } }).publicationVerified).toBe(true);
    expect(articleSaveFeedback({ error: 'failed', articleId: id, publicationVerified: true, webflowStatus: 'published' }).publicationVerified).toBe(false);
  });
});
