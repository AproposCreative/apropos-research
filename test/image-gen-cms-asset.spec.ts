import { beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
const f = vi.hoisted(() => ({ fetch: vi.fn(), media: vi.fn() }));
vi.mock('@/lib/image-gen/webflow', () => ({ imageGenCmsConfiguration: () => ({ token: 'test-secret', site: 'a'.repeat(24) }) }));
vi.mock('@/lib/liv/public-media-reader', () => ({ readPublicMedia: f.media }));
import { uploadImageGenCmsAsset, assertCmsAssetWriteAccess } from '@/lib/image-gen/cms-asset';
const bytes = Buffer.from('fixture-image');
const name = `apropos-${'b'.repeat(64)}.webp`;
const allocation = { id: 'c'.repeat(24), hostedUrl: 'https://cdn.prod.website-files.com/site/image.webp',
  uploadUrl: 'https://webflow-prod-assets.s3.amazonaws.com/', uploadDetails: { key: 'site/image.webp', policy: 'signed-policy', xAmzAlgorithm: 'AWS4-HMAC-SHA256', contentType: 'image/webp' } };
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
  expect(request.body.get('Policy')).toBe('signed-policy');
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
it('uploads a selected PNG byte-for-byte with its real MIME and digest name', async () => {
  const original = await sharp({ create: { width: 1000, height: 700, channels: 3, background: 'blue' } }).png().toBuffer();
  const filename = `apropos-${createHash('sha256').update(original).digest('hex')}.png`;
  f.fetch.mockReset().mockResolvedValueOnce(Response.json({ ...allocation, uploadDetails: { ...allocation.uploadDetails, contentType: 'image/png' } }))
    .mockResolvedValueOnce(new Response(null, { status: 201 }));
  f.media.mockResolvedValue(original);
  await uploadImageGenCmsAsset(original, filename, vi.fn(), { preserveOriginal: true });
  const body = f.fetch.mock.calls[1][1].body;
  expect(body.get('Content-Type')).toBe('image/png');
  expect(Buffer.from(await body.get('file').arrayBuffer())).toEqual(original);
  await expect(uploadImageGenCmsAsset(original, name, vi.fn(), { preserveOriginal: true })).rejects.toThrow();
});
it('identifies missing server asset permission without accepting allocation or sending bytes', async () => {
  f.fetch.mockReset().mockResolvedValueOnce(new Response(null, { status: 403 }));
  const checkpoint = vi.fn();
  await expect(uploadImageGenCmsAsset(bytes, name, checkpoint)).rejects.toMatchObject({ message: 'mcp_submission_webflow_asset_access_required', httpStatus: 403 });
  expect(checkpoint).not.toHaveBeenCalled(); expect(f.fetch).toHaveBeenCalledTimes(1);
});
it('requires read-only evidence of restored asset scopes before a permission retry', async () => {
  f.fetch.mockReset().mockResolvedValueOnce(Response.json({ authorization: { scope: 'cms:read,cms:write' } }))
    .mockResolvedValueOnce(Response.json({ authorization: { scope: 'cms:read,assets:read,assets:write' } }));
  await expect(assertCmsAssetWriteAccess()).rejects.toThrow('asset_access_required');
  await expect(assertCmsAssetWriteAccess()).resolves.toBeUndefined();
  expect(f.fetch.mock.calls.every(call => call[0].endsWith('/token/introspect'))).toBe(true);
});
