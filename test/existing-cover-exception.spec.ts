import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const state = vi.hoisted(() => ({ db: null as any, files: new Map<string, Buffer>(), bytes: Buffer.alloc(0), upload: vi.fn(), loseSave: false }));
// Test-only raster; never commit the owner's private image as a test fixture.
vi.mock('@/lib/editorial/existing-cover-authorization', async original => {
  const actual = await original<any>();
  const sharp = (await import('sharp')).default;
  state.bytes = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: 'blue' } }).png().toBuffer();
  return { EXISTING_COVER_AUTHORIZATION: Object.freeze({ ...actual.EXISTING_COVER_AUTHORIZATION,
    sectionId: (await import('node:crypto')).createHash('sha256').update('Det første afsnit med brugerens egne ord.\n0').digest('hex'),
    sha256: (await import('node:crypto')).createHash('sha256').update(state.bytes).digest('hex'), byteCount: state.bytes.length }) };
});
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db, getAdminAuth: () => ({ getUser: async () => ({ email: 'frederik@aproposmagazine.com', emailVerified: true }) }),
  getAdminStorageBucket: () => ({ file: (path: string) => ({ save: async (bytes: Buffer) => {
    state.files.set(path, bytes); if (state.loseSave) throw Error('lost reply');
  }, download: async () => { if (!state.files.has(path)) throw Error('missing'); return [state.files.get(path)]; } }) }) }));
vi.mock('@/lib/image-gen/cms-asset', async original => ({ ...await original<any>(), uploadImageGenCmsAsset: (...args: any[]) => state.upload(...args) }));
vi.mock('@/lib/editorial/submission-published-target', async original => ({ ...await original<any>(), findBoundCoverByHash: async () => null }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => ({ authors: [], categories: [], topics: [] }) }));
import { EXISTING_COVER_AUTHORIZATION as permit } from '@/lib/editorial/existing-cover-authorization';
import { assertExistingCoverBytes, assertExistingCoverIntent, assertExistingCoverReplacement, existingCoverAssetId } from '@/lib/editorial/existing-cover-exception';
import { stageExistingCover } from '@/lib/editorial/stage-existing-cover';
import { selectGeneratedImage, declineGeneratedImage, imageCandidatePreviews } from '@/lib/editorial/generated-image-candidate';
import { getSubmissionStatus, readSubmission, updateSubmission } from '@/lib/editorial/submissions';
import { chatImageImportInput, importSuppliedImage } from '@/lib/editorial/chat-image-import';
import { assertNoApprovedImageReplacement } from '@/lib/editorial/approved-image-guard';
import { assertGenerationContract } from '@/lib/editorial/image-generation-evidence';
import { imageProtectedContentHash } from '@/lib/editorial/image-content-invariant';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
let memory: ReturnType<typeof memoryFirestore>;
const path = `editorialSubmissions/${permit.submissionId}`, oldUrl = 'https://cdn.prod.website-files.com/test/old-cover.png';
const assetPath = () => `${path}/chatAssets/${existingCoverAssetId()}`;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('FIREBASE_STORAGE_BUCKET', 'test-only'); state.files.clear(); state.loseSave = false;
  memory = memoryFirestore(); state.db = memory.db;
  const article = { title: 'Brugerens uændrede artikel', subtitle: 'Undertitel', intro: 'Intro',
    content: '<p>Det første afsnit med brugerens egne ord.</p><figure><img src="https://cdn.test/body.png" alt="Kage"/><figcaption>Kagen.</figcaption></figure><h2>Næste afsnit</h2><p>Også uændret.</p>',
    author: 'Frederik', category: 'Kultur', seoTitle: 'SEO titel', seoDescription: 'En beskrivelse', slug: 'original-slug', subjectType: 'culture', featuredImage: oldUrl };
  memory.rows.set(path, { id: permit.submissionId, uid: permit.uid, revision: 9, status: 'draft', contentHash: 'd'.repeat(64),
    article, originalArticle: article, requestId: 'original-submission', choices: { kind: 'commentary', media: 'illustration', aiFinalChecks: 'human' }, research: [],
    publishedTarget: { itemId: permit.cmsItemId, fields: {}, fieldDataHash: 'c'.repeat(64), linkedAt: '2026-10-20T18:46:56Z' } });
  memory.rows.set(`${path}/chatAssets/${permit.parentAssetId}`, { uid: permit.uid, submissionId: permit.submissionId, assetId: permit.parentAssetId,
    status: 'attached', role: 'cover', originalHash: permit.parentHash, url: oldUrl });
  memory.rows.set(`${path}/publicationConsents/historical`, { uid: permit.uid, acceptedAt: '2026-10-20T17:51:00Z', media: [{ url: oldUrl }, { url: 'https://cdn.test/body.png' }] });
  state.upload.mockImplementation(async (_bytes, _name, save) => { const asset = { id: 'real', url: 'https://cdn.prod.website-files.com/test/new-cover.png' }; await save(asset); return asset; });
});
afterEach(() => vi.unstubAllEnvs());

it('stages exact bytes privately with honest history, no CMS upload, no selection, no article mutation', async () => {
  const before = cmsFieldHash(memory.rows.get(path)), consent = structuredClone(memory.rows.get(`${path}/publicationConsents/historical`));
  const result = await stageExistingCover(permit.uid, 9, state.bytes);
  expect(result).toMatchObject({ importStatus: 'awaiting_personal_selection', revision: 9, publicationApproval: false, originalPreserved: true });
  const asset = memory.rows.get(assetPath());
  expect(asset.existingCoverAuthorization).toEqual(permit); expect(asset.origin).toBe('chatgpt-edited');
  expect(asset.generationEvidence).toMatchObject({ status: 'not_supplied', canonicalPromptHash: null, exactPromptExecutionVerified: false });
  expect(asset.personalSelection).toBeUndefined(); expect(asset.url).toBeUndefined(); expect(state.upload).not.toHaveBeenCalled();
  expect(cmsFieldHash(memory.rows.get(path))).toBe(before); expect(memory.rows.get(`${path}/publicationConsents/historical`)).toEqual(consent);
  const status = await getSubmissionStatus(permit.uid, permit.submissionId);
  expect(status.imageCandidates[0].historyWarning).toBe(permit.warning); expect(status.imageCandidates[0].current).toBe(true);
  expect((await imageCandidatePreviews(permit.uid, permit.submissionId, status.imageCandidates))[result.assetId]).toMatch(/^data:image\/webp;base64,/);
  expect(status.imageSelection.required).toBe(true);
});
it('personal selection attaches once, preserves body/text/CMS identity and warns after attachment', async () => {
  const before = structuredClone(memory.rows.get(path));
  await stageExistingCover(permit.uid, 9, state.bytes);
  const result = await selectGeneratedImage(permit.uid, permit.submissionId, 9, existingCoverAssetId(), permit.sha256);
  expect(result).toMatchObject({ revision: 10, publicationApproval: false });
  const after = memory.rows.get(path), asset = memory.rows.get(assetPath());
  expect(after.article.content).toBe(before.article.content); expect(after.publishedTarget).toEqual(before.publishedTarget);
  expect(imageProtectedContentHash(after.article)).toBe(imageProtectedContentHash(before.article));
  expect(after.article.featuredImage).toBe(asset.url); expect(after.status).toBe('draft'); expect(after.publicationConsentPending).toBe(false);
  expect(asset.personalSelection).toMatchObject({ source: 'personal-preview', originalHash: permit.sha256, revision: 9,
    existingCoverAuthorizationId: permit.id, preflightPassed: false, canonicalGenerationComplianceVerified: false });
  expect(memory.rows.get(`${path}/versions/9`)).toEqual(before);
  const status = await getSubmissionStatus(permit.uid, permit.submissionId);
  expect(status.imageCandidates).toHaveLength(0); expect(status.imageSelection.required).toBe(false);
  expect(status.imageSelection.warnings[0].message).toBe(permit.warning);
  await selectGeneratedImage(permit.uid, permit.submissionId, 9, existingCoverAssetId(), permit.sha256);
  expect(state.upload).toHaveBeenCalledTimes(1); expect(memory.rows.get(path).revision).toBe(10);
});
it('rejects altered bytes, wrong owner and stale version without writes', async () => {
  const before = cmsFieldHash([...memory.rows]); const altered = Buffer.from(state.bytes); altered[100] ^= 1;
  expect(() => assertExistingCoverBytes(altered)).toThrow('not_authorized');
  await expect(stageExistingCover('colleague', 9, state.bytes)).rejects.toThrow('not_authorized');
  await expect(stageExistingCover(permit.uid, 8, state.bytes)).rejects.toThrow('revision_conflict');
  await expect(stageExistingCover(permit.uid, 9, altered)).rejects.toThrow('not_authorized');
  expect(cmsFieldHash([...memory.rows])).toBe(before); expect(state.files.size).toBe(0); expect(state.upload).not.toHaveBeenCalled();
});
it.each(['uid', 'id', 'cms', 'parent', 'body', 'origin', 'brief', 'report', 'request'])('cannot generalize authority: %s', async change => {
  await stageExistingCover(permit.uid, 9, state.bytes);
  const row = structuredClone(memory.rows.get(path)), input = structuredClone(memory.rows.get(assetPath()).importInput);
  if (change === 'uid') row.uid = 'other';
  if (change === 'id') row.id = 'a'.repeat(64);
  if (change === 'cms') row.publishedTarget.itemId = 'b'.repeat(24);
  if (change === 'parent') input.replaceAssetId = 'c'.repeat(64);
  if (change === 'body') input.role = 'body';
  if (change === 'origin') input.origin = 'user-upload';
  if (change === 'brief') input.briefId = 'd'.repeat(64);
  if (change === 'report') input.generationReport = {};
  if (change === 'request') input.requestId = 'new-attempt';
  await expect(assertExistingCoverIntent(row, input)).rejects.toThrow('not_authorized');
});
it('does not weaken canonical import, public schema, or approved image guards', async () => {
  await stageExistingCover(permit.uid, 9, state.bytes);
  const asset = memory.rows.get(assetPath()), row = await readSubmission(permit.uid, permit.submissionId);
  expect(() => assertGenerationContract(asset.importInput, null)).toThrow('brief_required');
  expect(chatImageImportInput.safeParse({ ...asset.importInput, existingCoverAuthorizationId: permit.id }).success).toBe(false);
  await expect(importSuppliedImage(permit.uid, asset.importInput, { identity: permit.fileId, read: async () => state.bytes, provenance: 'test' })).rejects.toThrow('brief_required');
  await expect(assertNoApprovedImageReplacement(row, [oldUrl])).rejects.toThrow('approved_image_locked');
  await expect(assertExistingCoverReplacement(row, [oldUrl], { assetId: asset.assetId, url: 'https://cdn.test/fake.png' })).rejects.toThrow('not_authorized');
  expect(state.upload).not.toHaveBeenCalled();
});
it('decline is durable and does not permit restaging or relabelling', async () => {
  await stageExistingCover(permit.uid, 9, state.bytes);
  await declineGeneratedImage(permit.uid, permit.submissionId, 9, existingCoverAssetId(), permit.sha256);
  await expect(stageExistingCover(permit.uid, 9, state.bytes)).rejects.toThrow('candidate_declined');
  await expect(selectGeneratedImage(permit.uid, permit.submissionId, 9, existingCoverAssetId(), permit.sha256)).rejects.toThrow('candidate_declined');
  expect(state.upload).not.toHaveBeenCalled();
});
it('rejects stale selection and prose or parent changes after staging', async () => {
  await stageExistingCover(permit.uid, 9, state.bytes);
  await expect(selectGeneratedImage(permit.uid, permit.submissionId, 8, existingCoverAssetId(), permit.sha256)).rejects.toThrow('preview_changed');
  memory.rows.get(path).article.title = 'Changed prose';
  await expect(selectGeneratedImage(permit.uid, permit.submissionId, 9, existingCoverAssetId(), permit.sha256)).rejects.toThrow('preview_changed');
  memory.rows.get(path).article.title = 'Brugerens uændrede artikel'; memory.rows.get(path).article.featuredImage = 'https://cdn.test/another.png';
  await expect(selectGeneratedImage(permit.uid, permit.submissionId, 9, existingCoverAssetId(), permit.sha256)).rejects.toThrow('not_authorized');
  expect(state.upload).not.toHaveBeenCalled();
});
it('recovers private storage timeout with no CMS upload or generation', async () => {
  state.loseSave = true; await stageExistingCover(permit.uid, 9, state.bytes); await stageExistingCover(permit.uid, 9, state.bytes);
  expect(state.files.size).toBe(1); expect(state.upload).not.toHaveBeenCalled();
});
it('revalidates personal evidence inside final transaction after upload', async () => {
  await stageExistingCover(permit.uid, 9, state.bytes);
  state.upload.mockImplementation(async (_bytes, _name, save) => {
    const asset = { id: 'real', url: 'https://cdn.prod.website-files.com/test/new-cover.png' }; await save(asset);
    memory.rows.get(assetPath()).personalSelection.originalHash = 'e'.repeat(64); return asset;
  });
  await expect(selectGeneratedImage(permit.uid, permit.submissionId, 9, existingCoverAssetId(), permit.sha256)).rejects.toThrow('not_authorized');
  expect(memory.rows.get(path).revision).toBe(9); expect(memory.rows.get(path).article.featuredImage).toBe(oldUrl);
});
it('cannot use the permit to remove body images or alter text in an update', async () => {
  await stageExistingCover(permit.uid, 9, state.bytes);
  const row = memory.rows.get(path), asset = memory.rows.get(assetPath());
  asset.status = 'uploaded'; asset.hash = permit.sha256; asset.url = 'https://cdn.prod.website-files.com/test/new-cover.png';
  asset.personalSelection = { uid: permit.uid, assetId: asset.assetId, originalHash: permit.sha256, revision: 9, contentHash: row.contentHash,
    source: 'personal-preview', acceptedAt: '2026-10-21T07:30:00Z', existingCoverAuthorizationId: permit.id };
  await expect(updateSubmission(permit.uid, { submissionId: permit.submissionId, expectedRevision: 9, requestId: 'unsafe-body-removal',
    article: { featuredImage: asset.url, content: row.article.content.replace(/<figure>.*?<\/figure>/, '') } },
  { existingCoverAssetId: asset.assetId, replaceUrls: [oldUrl, 'https://cdn.test/body.png'], protectedContentHash: imageProtectedContentHash(row.article) })).rejects.toThrow('not_authorized');
  await expect(updateSubmission(permit.uid, { submissionId: permit.submissionId, expectedRevision: 9, requestId: 'unsafe-text-change',
    article: { featuredImage: asset.url, title: 'Changed title' } },
  { existingCoverAssetId: asset.assetId, replaceUrls: [oldUrl], protectedContentHash: imageProtectedContentHash(row.article) })).rejects.toThrow('image_content_changed');
  expect(memory.rows.get(path).revision).toBe(9);
});
