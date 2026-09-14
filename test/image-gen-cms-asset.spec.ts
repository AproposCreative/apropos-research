import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ fetch: vi.fn(), media: vi.fn() }));
vi.mock('@/lib/image-gen/webflow', () => ({ imageGenCmsConfiguration: () => ({ token: 'test-secret', site: 'a'.repeat(24) }) }));
vi.mock('@/lib/liv/public-media-reader', () => ({ readPublicMedia: f.media }));
import { uploadImageGenCmsAsset } from '@/lib/image-gen/cms-asset';
const bytes = Buffer.from('fixture-image');
const name = `apropos-${'b'.repeat(64)}.webp`;
const allocation = { id: 'c'.repeat(24), hostedUrl: 'https://cdn.prod.website-files.com/site/image.webp',
  uploadUrl: 'https://webflow-prod-assets.s3.amazonaws.com/', uploadDetails: { key: 'site/image.webp', xAmzAlgorithm: 'AWS4-HMAC-SHA256', contentType: 'image/webp' } };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('fetch', f.fetch);
  f.fetch.mockResolvedValueOnce(Response.json(allocation)).mockResolvedValueOnce(new Response(null, { status: 201 }));
  f.media.mockResolvedValue(bytes);
});
it('checkpoints identity before upload, sends no CMS token to storage and verifies the CDN bytes', async () => {
  const checkpoint = vi.fn(async () => { expect(f.fetch).toHaveBeenCalledTimes(1); });
  await expect(uploadImageGenCmsAsset(bytes, name, checkpoint)).resolves.toEqual({ id: allocation.id, url: allocation.hostedUrl });
  const request = f.fetch.mock.calls[1][1];
  expect(request.headers).toBeUndefined(); expect(request.redirect).toBe('error');
  expect(request.body.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
  expect(request.body.get('Content-Type')).toBe('image/webp');
  expect(f.media).toHaveBeenCalledWith(allocation.hostedUrl, 'image');
});
it('rejects unexpected upload destinations before checkpoint or binary transmission', async () => {
  f.fetch.mockReset().mockResolvedValueOnce(Response.json({ ...allocation, uploadUrl: 'https://attacker.example/upload' }));
  const checkpoint = vi.fn();
  await expect(uploadImageGenCmsAsset(bytes, name, checkpoint)).rejects.toThrow('destination_invalid');
  expect(checkpoint).not.toHaveBeenCalled(); expect(f.fetch).toHaveBeenCalledOnce();
});
it('does not allocate or upload again after an uncertain upload', async () => {
  f.fetch.mockReset().mockResolvedValueOnce(Response.json(allocation)).mockRejectedValueOnce(new Error('timeout'));
  const checkpoint = vi.fn();
  await expect(uploadImageGenCmsAsset(bytes, name, checkpoint)).rejects.toThrow('timeout');
  expect(checkpoint).toHaveBeenCalledOnce(); expect(f.fetch).toHaveBeenCalledTimes(2);
});
it('rejects a CDN response that differs from the stored image', async () => {
  f.media.mockResolvedValue(Buffer.from('wrong'));
  await expect(uploadImageGenCmsAsset(bytes, name, vi.fn())).rejects.toThrow('readback_failed');
  expect(f.fetch).toHaveBeenCalledTimes(2);
});
