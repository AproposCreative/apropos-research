import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const mocks = vi.hoisted(() => ({ metadata: vi.fn(), download: vi.fn(), file: vi.fn(), publicRead: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminStorageBucket: () => ({ file: mocks.file }) }));
vi.mock('@/lib/liv/public-media-reader', () => ({ readPublicMedia: mocks.publicRead }));
import { readLivStoredImage } from '@/lib/liv/stored-image-reader';
const bytes = Buffer.from('test-image');
const hash = createHash('sha256').update(bytes).digest('hex');
const token = '12345678-1234-1234-1234-123456789012';
const path = `editorial-images/liv-daily/${'a'.repeat(64)}/body-1-${hash}.webp`;
const url = `https://firebasestorage.googleapis.com/v0/b/our-bucket/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('FIREBASE_STORAGE_BUCKET', 'our-bucket');
  mocks.file.mockReturnValue({ getMetadata: mocks.metadata, download: mocks.download });
  mocks.metadata.mockResolvedValue([{ generation: '12', size: bytes.length, contentType: 'image/webp', metadata: { firebaseStorageDownloadTokens: token, sha256: hash } }]);
  mocks.download.mockResolvedValue([bytes]);
});
afterEach(() => vi.unstubAllEnvs());
it('reads only the verified immutable own-bucket generation', async () => {
  expect(await readLivStoredImage(url)).toEqual(bytes);
  expect(mocks.file).toHaveBeenLastCalledWith(path, { generation: '12' });
  expect(mocks.publicRead).not.toHaveBeenCalled();
});
it.each([url.replace('our-bucket', 'another-bucket'), url.replace('editorial-images%2Fliv-daily', 'private%2Ffiles'), url + '&auth=bad', url.replace('https:', 'http:'), url.replace(token, 'bad-token')])('rejects unsafe or unrelated Firebase URLs', async bad => {
  await expect(readLivStoredImage(bad)).rejects.toThrow('invalid');
  expect(mocks.file).not.toHaveBeenCalled();
  expect(mocks.publicRead).not.toHaveBeenCalled();
});
it('cannot use admin access to read a file lacking the public download token', async () => {
  mocks.metadata.mockResolvedValue([{ size: bytes.length, contentType: 'image/webp', metadata: { sha256: hash } }]);
  await expect(readLivStoredImage(url)).rejects.toThrow('mismatch');
  expect(mocks.download).not.toHaveBeenCalled();
});
it('rejects bytes that do not match the immutable filename hash', async () => {
  mocks.download.mockResolvedValue([Buffer.from('changed')]);
  await expect(readLivStoredImage(url)).rejects.toThrow('mismatch');
});
it('leaves all other URLs under the existing SSRF-safe public reader', async () => {
  mocks.publicRead.mockResolvedValue(bytes);
  expect(await readLivStoredImage('https://cdn.test/image.webp')).toEqual(bytes);
  expect(mocks.publicRead).toHaveBeenCalledWith('https://cdn.test/image.webp', 'image');
  expect(mocks.file).not.toHaveBeenCalled();
});
