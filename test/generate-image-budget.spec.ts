import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { currentLivCostContext } from '@/lib/liv/cost-context';
import { quoteLivImageRequest } from '@/lib/liv/cost-pricing';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
const m = vi.hoisted(() => ({ text: vi.fn(), image: vi.fn(), store: vi.fn(), tmdb: vi.fn(), media: vi.fn(), google: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: m.text } }, images: { generate: m.image } }), models: { default: 'test' } }));
vi.mock('@/lib/images/optimize-and-upload', () => ({ optimizeAndUploadImageBytes: m.store }));
vi.mock('@/lib/config/env', () => ({ config: { features: { tmdb: true } } }));
vi.mock('@/lib/media-search-utils', () => ({ isMediaReview: m.media, searchTMDB: m.tmdb, searchGoogleImages: m.google }));
import { POST } from '@/app/api/generate-image/route';
import { POST as thumbnail } from '@/app/api/generate-thumbnail/route';
const request = (body: object) => new NextRequest('http://localhost/api/generate-image', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); m.media.mockReturnValue({ type: 'film', searchTerm: 'Film' }); vi.stubEnv('AI_SHARED_COST_ENABLED', 'true'); vi.stubEnv('AI_IMAGE_GENERATION_ENABLED', 'true'); });
afterEach(() => vi.unstubAllEnvs());
it.each(['true', 'false'])('never turns a failed film lookup into paid AI, enabled=%s', async enabled => {
  vi.stubEnv('AI_IMAGE_GENERATION_ENABLED', enabled);
  m.tmdb.mockRejectedValue(new Error('provider-secret-fixture'));
  const response = await POST(request({ title: 'Film', category: 'Film' }));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain('provider-secret-fixture');
  expect(m.image).not.toHaveBeenCalled(); expect(m.text).not.toHaveBeenCalled();
});
it('does not substitute a generated scene when game lookup is empty', async () => {
  m.media.mockReturnValue({ type: 'game', searchTerm: 'Game' }); m.google.mockResolvedValue(null);
  const response = await POST(request({ title: 'Spilanmeldelse', category: 'Gaming' }));
  expect(response.status).toBe(404); expect(m.google).toHaveBeenCalledOnce();
  expect(m.image).not.toHaveBeenCalled(); expect(m.text).not.toHaveBeenCalled();
});
it('keeps provider details out of image failure responses', async () => {
  m.image.mockRejectedValue(new Error('provider-secret-fixture required'));
  const response = await POST(request({ title: 'Byens parker' }));
  expect(response.status).toBe(500); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(JSON.stringify(await response.json())).not.toContain('provider-secret-fixture');
});
it('generates the priced shape once and persists bytes before returning a URL', async () => {
  m.image.mockImplementation(async (body, options) => {
    expect(currentLivCostContext()).toMatchObject({ scope: 'writer', stage: 'generate-image' });
    expect(quoteLivImageRequest('/images/generations', body).reservedUsdMicros).toBeGreaterThan(0);
    expect(options).toMatchObject({ maxRetries: 0, timeout: 90000 });
    return { data: [{ b64_json: Buffer.from('mock image bytes').toString('base64') }] };
  });
  m.store.mockResolvedValue({ url: 'https://stored.example/art.webp', width: 1920, height: 1080 });
  const response = await POST(request({ title: 'Byens parker', category: 'Kultur' }));
  expect(response.status).toBe(200); expect((await response.json()).imageUrl).toBe('https://stored.example/art.webp');
  expect(m.image).toHaveBeenCalledTimes(1); expect(Buffer.isBuffer(m.store.mock.calls[0][0])).toBe(true);
});
it('legacy thumbnail uses shared storage and the old data envelope', async () => {
  m.image.mockImplementation(async (body) => {
    expect(currentLivCostContext()).toMatchObject({ scope: 'writer', stage: 'generate-image' });
    expect(body.model).toBe('gpt-image-1.5');
    return { data: [{ b64_json: Buffer.from('mock bytes').toString('base64') }] };
  });
  m.store.mockResolvedValue({ url: 'https://stored.example/thumb.webp' });
  const response = await thumbnail(request({ title: 'Byens parker' }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true, data: { success: true, imageUrl: 'https://stored.example/thumb.webp' } });
  expect(m.image).toHaveBeenCalledTimes(1);
});
it('legacy thumbnail obeys the paid-image off switch', async () => {
  vi.stubEnv('AI_IMAGE_GENERATION_ENABLED', 'false');
  expect((await thumbnail(request({ title: 'Byens parker' }))).status).toBe(403);
  expect(m.image).not.toHaveBeenCalled(); expect(m.text).not.toHaveBeenCalled();
});
it('legacy thumbnail propagates budget refusal without fallback', async () => {
  m.image.mockRejectedValue(new LivCostPretransportError('limit'));
  const response = await thumbnail(request({ title: 'Byens parker' }));
  expect(response.status).toBe(503); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(m.image).toHaveBeenCalledTimes(1); expect(m.store).not.toHaveBeenCalled();
});
it('planning denial stops before image generation', async () => {
  m.text.mockRejectedValue(new LivCostPretransportError('limit'));
  const response = await POST(request({ title: 'Byens parker', content: 'Kunst og kultur. '.repeat(20) }));
  expect(response.status).toBe(503); expect(m.image).not.toHaveBeenCalled(); expect(m.store).not.toHaveBeenCalled();
});
it('image denial does not upload or retry', async () => {
  m.image.mockRejectedValue(new LivCostPretransportError('limit'));
  expect((await POST(request({ title: 'Byens parker' }))).status).toBe(503);
  expect(m.image).toHaveBeenCalledTimes(1); expect(m.store).not.toHaveBeenCalled();
});
it('official lookup works with generation disabled and never calls a model', async () => {
  vi.stubEnv('AI_IMAGE_GENERATION_ENABLED', 'false'); m.tmdb.mockResolvedValue('https://image.tmdb.org/poster.jpg');
  const response = await POST(request({ title: 'Film', category: 'Film' }));
  expect(response.status).toBe(200); expect((await response.json()).source).toBe('tmdb');
  expect(m.text).not.toHaveBeenCalled(); expect(m.image).not.toHaveBeenCalled();
});
