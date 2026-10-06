import { beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const mock = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/liv/public-media-reader', () => ({ readPublicMedia: mock.read }));
import { importedImageResult } from '@/lib/mcp/import-image-result';
const receipt = { assetId: 'a'.repeat(64), url: 'https://cdn.prod.website-files.com/asset.webp', revision: 4, replay: false, paidAiCalls: 0 };
beforeEach(() => vi.resetAllMocks());
it('returns actual saved-image pixels in the MCP result, not only a file ID or link', async () => {
  mock.read.mockResolvedValue(await sharp({ create: { width: 1200, height: 800, channels: 3, background: 'blue' } }).png().toBuffer());
  const result = await importedImageResult(receipt);
  expect(mock.read).toHaveBeenCalledExactlyOnceWith(receipt.url, 'image', 5000);
  expect(result.content[1]).toMatchObject({ type: 'image', mimeType: 'image/webp' });
  const img = result.content[1] as { data: string };
  expect(await sharp(Buffer.from(img.data, 'base64')).metadata()).toMatchObject({ width: 960, height: 640, format: 'webp' });
  expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('"importStatus":"attached"') });
});
it('never turns a completed import into a failure when image preview cannot load', async () => {
  mock.read.mockRejectedValue(Error('private signed URL or transport error'));
  const result = await importedImageResult({ ...receipt, replay: true });
  expect(result.isError).not.toBe(true); expect(result.content).toHaveLength(1);
  const data = JSON.parse((result.content[0] as { text: string }).text);
  expect(data).toMatchObject({ ...receipt, replay: true, importStatus: 'attached', imagePreview: 'unavailable' });
  expect(data.nextAction).toContain('preview_submission');
  expect(JSON.stringify(result)).not.toContain('private signed');
});
