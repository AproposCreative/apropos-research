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
const optimizedPath = `webflow/content-images/2026/09/alle-guds-farver-inline-01-1200w-abc123-${hash.slice(0, 16)}-${token}.webp`;
const optimizedUrl = (storagePath = optimizedPath) => `https://firebasestorage.googleapis.com/v0/b/our-bucket/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
const optimizedMetadata = () => ({ generation: '12', size: bytes.length, contentType: 'image/webp',
  metadata: { firebaseStorageDownloadTokens: token } });
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

it('reads an owned optimized inline image without sha256 metadata, pinned to its CRC-checked generation', async () => {
  mocks.metadata.mockResolvedValue([optimizedMetadata()]);
  expect(await readLivStoredImage(optimizedUrl())).toEqual(bytes);
  expect(mocks.file).toHaveBeenLastCalledWith(optimizedPath, { generation: '12' });
  expect(mocks.download).toHaveBeenCalledWith({ validation: 'crc32c' });
  expect(mocks.publicRead).not.toHaveBeenCalled();
});
it.each([
  optimizedPath.replace('/2026/', '/0000/'),
  optimizedPath.replace('/2026/', '/26/'),
  optimizedPath.replace('/09/', '/00/'),
  optimizedPath.replace('/09/', '/13/'),
  optimizedPath.replace('content-images', 'mobile-images'),
  optimizedPath.replace('inline-01', 'hero'),
  optimizedPath.replace('inline-01', 'inline-00'),
  optimizedPath.replace('1200w', '0w'),
  optimizedPath.replace('abc123', 'abcdefg'),
  optimizedPath.replace(hash.slice(0, 16), hash.slice(0, 15)),
  optimizedPath.replace(token, 'not-a-uuid'),
  optimizedPath.replace('.webp', '.jpg'),
  optimizedPath.replace('alle-guds-farver', '../private'),
  optimizedPath.replace('alle-guds-farver', 'private/file'),
])('rejects unrelated or malformed optimized path %s before accessing storage', async storagePath => {
  await expect(readLivStoredImage(optimizedUrl(storagePath))).rejects.toThrow('invalid');
  expect(mocks.file).not.toHaveBeenCalled();
  expect(mocks.publicRead).not.toHaveBeenCalled();
});
it.each([
  optimizedUrl().replace('our-bucket', 'another-bucket'),
  optimizedUrl() + '&auth=bad',
  optimizedUrl().replace('https:', 'http:'),
  optimizedUrl().replace(`token=${token}`, 'token=bad-token'),
])('retains URL restrictions for optimized images', async bad => {
  await expect(readLivStoredImage(bad)).rejects.toThrow('invalid');
  expect(mocks.file).not.toHaveBeenCalled();
});
it.each([
  { generation: '' }, { generation: 'invalid' }, { size: 0 }, { size: 450 * 1024 + 1 },
  { contentType: 'image/jpeg' }, { metadata: {} },
  { metadata: { firebaseStorageDownloadTokens: '87654321-1234-1234-1234-123456789012' } },
])('retains optimized image metadata restrictions: %j', async patch => {
  mocks.metadata.mockResolvedValue([{ ...optimizedMetadata(), ...patch }]);
  await expect(readLivStoredImage(optimizedUrl())).rejects.toThrow('mismatch');
  expect(mocks.download).not.toHaveBeenCalled();
});
it('rejects same-length optimized bytes with a different output digest', async () => {
  mocks.metadata.mockResolvedValue([optimizedMetadata()]);
  mocks.download.mockResolvedValue([Buffer.alloc(bytes.length)]);
  await expect(readLivStoredImage(optimizedUrl())).rejects.toThrow('mismatch');
});
it('rejects a size mismatch even when the optimized digest matches', async () => {
  mocks.metadata.mockResolvedValue([{ ...optimizedMetadata(), size: bytes.length + 1 }]);
  await expect(readLivStoredImage(optimizedUrl())).rejects.toThrow('mismatch');
});
it('rejects conflicting optional full-hash metadata on optimized images', async () => {
  mocks.metadata.mockResolvedValue([{ ...optimizedMetadata(), metadata: {
    firebaseStorageDownloadTokens: token, sha256: '0'.repeat(64),
  } }]);
  await expect(readLivStoredImage(optimizedUrl())).rejects.toThrow('mismatch');
});
it.each([undefined, hash.slice(0, 16), hash.slice(0, 16) + '0'.repeat(48)])('still requires the full original hash metadata: %s', async sha256 => {
  mocks.metadata.mockResolvedValue([{ ...optimizedMetadata(), metadata: { firebaseStorageDownloadTokens: token, sha256 } }]);
  await expect(readLivStoredImage(url)).rejects.toThrow('mismatch');
  expect(mocks.download).not.toHaveBeenCalled();
});
it('still checks all 64 original filename hash characters against the bytes', async () => {
  const wrongHash = hash.slice(0, 16) + '0'.repeat(48);
  mocks.metadata.mockResolvedValue([{ ...optimizedMetadata(), metadata: { firebaseStorageDownloadTokens: token, sha256: wrongHash } }]);
  await expect(readLivStoredImage(url.replace(hash, wrongHash))).rejects.toThrow('mismatch');
  expect(mocks.download).toHaveBeenCalledWith({ validation: 'crc32c' });
});
