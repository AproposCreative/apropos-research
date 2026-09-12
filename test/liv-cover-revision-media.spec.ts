import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const mocks = vi.hoisted(() => ({ create: vi.fn(), storedRead: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: mocks.create } } }) }));
vi.mock('@/lib/liv/stored-image-reader', () => ({ readLivStoredImage: mocks.storedRead }));
import { prepareCoverSource, reviewCover, verifyCoverImage, validateCoverSource,
  COVER_SOURCE_CREDIT, type CoverSource, type PreparedCover } from '@/lib/liv/cover-revision-media';
import { encodeWebp } from '@/lib/images/encode-webp';
import type { WebflowArticleFields } from '@/lib/webflow/types';
const source: CoverSource = {
  imageUrl: 'https://distribution.paradisbio.dk/log/film/Alle%20Guds%20Farver%20(374)/Alle%20Guds%20Farver_01.jpg',
  sourcePageUrl: 'https://distribution.paradisbio.dk/film.asp?id=374',
  alt: 'Pressebillede fra Alle Guds farver: En person i farverig drag og en præst foran et Kirken til Pride-banner.',
  caption: 'Pressebillede fra Alle Guds farver. Kilde: Øst for Paradis.',
};
const id = 'a'.repeat(64), hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
let original: Buffer, output: Buffer, prepared: PreparedCover;
beforeAll(async () => {
  original = await sharp({ create: { width: 3840, height: 1920, channels: 3, background: '#687a82' } }).jpeg().toBuffer();
  output = (await encodeWebp(original, { maxSizeKB: 450, maxLongEdge: 1920, qualityStart: 85,
    qualityMin: 55, effort: 4, targetDimensions: { width: 1920, height: 1080 } })).data;
  const stored = { url: 'https://cdn.prod.website-files.com/cover.webp', contentHash: hash(output), storagePath: 'fixture',
    width: 1920, height: 1080, bytes: output.length };
  prepared = { original: { ...stored, width: 3840, height: 1920, bytes: original.length, contentHash: hash(original) }, image: stored,
    source, sourcePageHash: 'b'.repeat(64), retrievedAt: '2026-09-12T10:00:00Z', credit: COVER_SOURCE_CREDIT,
    attribution: 'distributor-source', photographer: null, rightsStatus: 'unverified', crop: 'center-cover' };
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.storedRead.mockResolvedValue(output);
  mocks.create.mockResolvedValue({ model: 'fixture-utility', usage: { total_tokens: 20 },
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ pass: true, reason: 'Relevant cover and crop' }), refusal: null } }] });
});
function dependencies() {
  const html = Buffer.from('<html><title>\xd8FP Presse</title><a href="/log/film/Alle Guds Farver (374)/Alle Guds Farver_01.jpg">Pressebillede</a></html>', 'latin1');
  const read = vi.fn().mockImplementation(async (_url: string, kind: string) => kind === 'html' ? html : original);
  const store = vi.fn().mockImplementation(async (_id: string, role: string, bytes: Buffer) => {
    const dimensions = await sharp(bytes).metadata();
    return { url: `https://owned.example/${role}.webp`, storagePath: role, bytes: bytes.length,
      width: dimensions.width!, height: dimensions.height!, contentHash: hash(bytes) };
  });
  return { read, store, html };
}
it('matches raw-space gallery links to encoded URLs and stores only original plus centered-cover hero', async () => {
  const deps = dependencies();
  const result = await prepareCoverSource(id, source, deps);
  expect(deps.read).toHaveBeenNthCalledWith(1, source.sourcePageUrl, 'html');
  expect(deps.read).toHaveBeenNthCalledWith(2, source.imageUrl, 'image');
  expect(deps.store).toHaveBeenCalledTimes(2);
  expect(deps.store).toHaveBeenNthCalledWith(1, id, 'hero-original', original);
  expect(deps.store).toHaveBeenNthCalledWith(2, id, 'hero', output);
  expect(result).toMatchObject({ attribution: 'distributor-source', photographer: null, rightsStatus: 'unverified',
    credit: 'Pressebillede: Øst for Paradis', crop: 'center-cover', source,
    sourcePageHash: hash(deps.html), image: { width: 1920, height: 1080, contentHash: hash(output) } });
  expect(result.image.bytes).toBeLessThanOrEqual(450 * 1024);
  expect(mocks.create).not.toHaveBeenCalled(); // Encoding is not generation or visual approval.
});
it('does not download an image absent from the source-page links', async () => {
  const deps = dependencies(); deps.read.mockResolvedValue(Buffer.from('<p>No matching link</p>'));
  await expect(prepareCoverSource(id, source, deps)).rejects.toThrow('source_not_linked');
  expect(deps.read).toHaveBeenCalledTimes(1); expect(deps.store).not.toHaveBeenCalled();
});
it.each([
  { imageUrl: source.imageUrl.replace('https:', 'http:') },
  { imageUrl: source.imageUrl.replace('distribution.paradisbio.dk', '127.0.0.1') },
  { imageUrl: source.imageUrl.replace('distribution.paradisbio.dk', 'distribution.paradisbio.dk.evil.test') },
  { imageUrl: source.imageUrl.replace('https://', 'https://user:password@') },
  { imageUrl: source.imageUrl + '?token=secret' }, { imageUrl: source.imageUrl + '#fragment' },
  { imageUrl: source.imageUrl.replace('_01.jpg', '_01.svg') },
  { sourcePageUrl: source.sourcePageUrl + '&extra=1' },
  { sourcePageUrl: source.sourcePageUrl.replace('374', '375') },
  { sourcePageUrl: 'https://localhost/film.asp?id=374' },
])('rejects unsupported/unsafe source selection %j before any reads', async patch => {
  const deps = dependencies();
  await expect(prepareCoverSource(id, { ...source, ...patch }, deps)).rejects.toThrow('invalid_source');
  expect(deps.read).not.toHaveBeenCalled(); expect(deps.store).not.toHaveBeenCalled();
});
it('accepts the explicit original press URL without inferring a photographer from its filename', () => {
  expect(() => validateCoverSource(source)).not.toThrow();
});
it.each(['small', 'png'])('rejects %s source bytes before uploading', async kind => {
  const deps = dependencies();
  const bytes = kind === 'small' ? await sharp({ create: { width: 200, height: 100, channels: 3, background: 'red' } }).jpeg().toBuffer()
    : await sharp(original).png().toBuffer();
  deps.read.mockImplementation(async (_url, type) => type === 'html' ? deps.html : bytes);
  await expect(prepareCoverSource(id, source, deps)).rejects.toThrow('source_invalid');
  expect(deps.store).not.toHaveBeenCalled();
});
it('records a real utility vision result separately from explicit human selection', async () => {
  const result = await reviewCover(prepared, { title: 'Alle Guds farver', intro: 'Original article intro' } as WebflowArticleFields);
  expect(result).toMatchObject({ pass: true, model: 'fixture-utility', finishReason: 'stop', contentHash: hash(output) });
  const [request, options] = mocks.create.mock.calls[0];
  expect(request.messages[0].content).toContain('Do not claim copyright or photographer verification');
  expect(request.messages[0].content).toContain('Existing body illustrations are outside');
  expect(request.messages[1].content.filter((part: { type: string }) => part.type === 'image_url')).toHaveLength(1);
  expect(options).toEqual({ timeout: 30000, maxRetries: 0 });
});
it.each([
  { finish_reason: 'length', message: { content: '{"pass":true,"reason":"OK"}' } },
  { finish_reason: 'stop', message: { refusal: 'Cannot verify', content: '{"pass":true,"reason":"OK"}' } },
  { finish_reason: 'stop', message: { content: 'not JSON' } },
  { finish_reason: 'stop', message: { content: '{"pass":"true","reason":"OK"}' } },
  { finish_reason: 'stop', message: { content: '{"pass":false,"reason":"Bad crop"}' } },
])('never treats incomplete, refused, malformed or rejected vision as approval: %j', async choice => {
  mocks.create.mockResolvedValue({ model: 'fixture', choices: [choice] });
  expect((await reviewCover(prepared, originalExpected())).pass).toBe(false);
});
function originalExpected() { return { title: 'Alle Guds farver', intro: 'Original intro' } as WebflowArticleFields; }
it('rejects changed stored pixels before spending on visual review', async () => {
  mocks.storedRead.mockResolvedValue(Buffer.from('changed'));
  await expect(reviewCover(prepared, originalExpected())).rejects.toThrow('asset_changed');
  expect(mocks.create).not.toHaveBeenCalled();
});
it('accepts an actual byte-identical CDN mobile image', async () => {
  expect(await verifyCoverImage('https://cdn.prod.website-files.com/renamed.webp', prepared)).toBe(true);
  expect(mocks.storedRead).toHaveBeenCalledWith('https://cdn.prod.website-files.com/renamed.webp');
});
it('rejects different bytes even if dimensions are correct', async () => {
  mocks.storedRead.mockResolvedValue(await sharp(output).negate().webp().toBuffer());
  expect(await verifyCoverImage('https://cdn.prod.website-files.com/other.webp', prepared)).toBe(false);
});
it.each(['jpeg', 'dimensions', 'size', 'unavailable'])('rejects invalid mobile proof: %s', async kind => {
  let image = prepared;
  if (kind === 'unavailable') mocks.storedRead.mockRejectedValue(new Error('not available'));
  else if (kind === 'size') image = { ...prepared, image: { ...prepared.image, bytes: output.length + 1 } };
  else {
    const bytes = kind === 'jpeg' ? await sharp(output).jpeg().toBuffer() : await sharp(output).resize(960, 540).webp().toBuffer();
    mocks.storedRead.mockResolvedValue(bytes);
    image = { ...prepared, image: { ...prepared.image, contentHash: hash(bytes), bytes: bytes.length } };
  }
  expect(await verifyCoverImage('https://cdn.prod.website-files.com/image', image)).toBe(false);
});
