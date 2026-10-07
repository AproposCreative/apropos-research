import { beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { memoryFirestore } from './helpers/mcp-firestore';
const state = vi.hoisted(() => ({ db: null as any, bytes: Buffer.alloc(0), media: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
vi.mock('@/lib/liv/public-media-reader', () => ({ readPublicMedia: (...args: unknown[]) => state.media(...args) }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => ({ authors: [], categories: [], topics: [], requiredFields: [] }) }));
import { verifySubmissionMedia } from '@/lib/editorial/submission-media-identity';
import { getSubmissionStatus } from '@/lib/editorial/submissions';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const id = 'a'.repeat(64), assetId = 'b'.repeat(64), url = 'https://cdn.test/selected.jpg', path = `editorialSubmissions/${id}`;
let memory: ReturnType<typeof memoryFirestore>;
const fields = () => ({ thumb: { url }, 'mobile-image': { url: 'https://cdn.test/mobile.jpg' }, content: '<p>William.</p>' });
beforeEach(async () => {
  vi.clearAllMocks(); memory = memoryFirestore(); state.db = memory.db;
  state.bytes = await sharp({ create: { width: 1280, height: 720, channels: 3, background: 'beige' } }).jpeg().toBuffer();
  state.media.mockResolvedValue(state.bytes);
  const article = { title: 'I mellemtiden er vi ingen', content: '<p>William.</p>', featuredImage: url };
  memory.rows.set(path, { id, uid: 'owner', revision: 1, article, originalArticle: article, choices: {}, research: [], status: 'published',
    publishedTarget: { itemId: 'c'.repeat(24), fields: fields(), fieldDataHash: cmsFieldHash(fields()) } });
  const hash = createHash('sha256').update(state.bytes).digest('hex');
  memory.rows.set(`${path}/chatAssets/${assetId}`, { assetId, url, hash, originalHash: hash, status: 'attached', role: 'cover', preserveOriginal: true });
});
it('verifies both desktop and mobile by original byte hash, not CMS asset metadata', async () => {
  const result = await verifySubmissionMedia('owner', id, fields());
  expect(result.assets[0].published).toHaveLength(2);
  expect(result.assets[0].published[0]).toMatchObject({ bytes: state.bytes.length, width: 1280, height: 720 });
  expect(state.media).toHaveBeenCalledTimes(2);
});
it('refuses a fallback or zero-byte asset, even when the CMS says it is published', async () => {
  state.media.mockResolvedValueOnce(state.bytes).mockResolvedValueOnce(await sharp(state.bytes).negate().jpeg().toBuffer());
  await expect(verifySubmissionMedia('owner', id, fields())).rejects.toThrow('media_identity_changed');
  state.media.mockResolvedValue(Buffer.alloc(0));
  await expect(verifySubmissionMedia('owner', id, fields())).rejects.toThrow();
});
it('does not fabricate publication identity from published status; exposes a dated verified receipt only', async () => {
  expect((await getSubmissionStatus('owner', id)).mediaIdentity[0]).toMatchObject({ actualPublishedAsset: null, publicationVerified: false });
  const mediaIdentity = await verifySubmissionMedia('owner', id, fields());
  memory.rows.get(path).publication = { receipt: { mediaIdentity } };
  expect((await getSubmissionStatus('owner', id)).mediaIdentity[0]).toMatchObject({ publicationVerified: true, verification: 'saved_publication_readback', verifiedAt: mediaIdentity.checkedAt });
  memory.rows.get(path).publishedTarget.fieldDataHash = 'changed';
  expect((await getSubmissionStatus('owner', id)).mediaIdentity[0].publicationVerified).toBe(false);
});
it('ignores replaced assets and verifies body identity at its stable figure', async () => {
  const row = memory.rows.get(path), receipt = memory.rows.get(`${path}/chatAssets/${assetId}`);
  row.article.featuredImage = 'https://cdn.test/different.jpg';
  expect((await verifySubmissionMedia('owner', id, fields())).assets).toEqual([]);
  receipt.role = 'body'; row.article.content = `<figure data-apropos-asset="${assetId}"><img src="${url}"></figure>`;
  const live = { ...fields(), content: row.article.content.replace(url, 'https://cdn.test/cms-copy.jpg') };
  expect((await verifySubmissionMedia('owner', id, live)).assets[0].published[0].url).toBe('https://cdn.test/cms-copy.jpg');
  await expect(verifySubmissionMedia('owner', id, fields())).rejects.toThrow('media_identity_changed');
});
