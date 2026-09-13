import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
const m = vi.hoisted(() => ({ create: vi.fn(), upload: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: m.create } } }), models: { default: 'test' } }));
vi.mock('@/lib/images/optimize-and-upload', () => ({ optimizeAndUploadImage: m.upload }));
import { POST } from '@/app/api/articles/import/route';
const request = (articleText = 'Original artikel') => new NextRequest('http://localhost/api/articles/import', {
  method: 'POST', body: JSON.stringify({ articleText, images: { hero: 'https://example.com/hero.jpg', body1: 'https://example.com/1.jpg', body2: 'https://example.com/2.jpg' } }),
});
beforeEach(() => { vi.resetAllMocks(); m.upload.mockResolvedValue({ url: 'https://example.com/stored.webp' }); vi.stubEnv('AI_SHARED_COST_ENABLED', 'true'); });
afterEach(() => vi.unstubAllEnvs());
it('rejects oversized text before AI or upload', async () => {
  expect((await POST(request('x'.repeat(24001)))).status).toBe(400);
  expect(m.create).not.toHaveBeenCalled(); expect(m.upload).not.toHaveBeenCalled();
});
it('returns uncached budget refusal without an article update', async () => {
  m.create.mockRejectedValue(new LivCostPretransportError('limit'));
  const r = await POST(request()); expect(r.status).toBe(503);
  expect(r.headers.get('cache-control')).toBe('no-store');
  expect(await r.json()).not.toHaveProperty('data.articleUpdate');
  expect(m.create).toHaveBeenCalledTimes(1);
});
it('never exposes raw provider errors or retries paid work', async () => {
  m.create.mockRejectedValue(new Error('private-provider-body'));
  const r = await POST(request()); expect(r.status).toBe(500);
  expect(await r.text()).not.toContain('private-provider-body');
  expect(m.create).toHaveBeenCalledTimes(1);
});
