import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { memoryFirestore } from './helpers/mcp-firestore';
const state = vi.hoisted(() => ({ db: null as any, sectionId: '', bytes: Buffer.alloc(0), stored: new Map<string, Buffer>(), upload: vi.fn(), download: vi.fn(), readback: vi.fn(), boundCover: vi.fn(), breakAttachment: false }));
vi.mock('@/lib/editorial/submission-published-target', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/editorial/submission-published-target')>(), findBoundCoverByHash: (...args: unknown[]) => state.boundCover(...args) }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db, getAdminStorageBucket: () => ({ file: (path: string) => ({
  save: async (bytes: Buffer) => { state.stored.set(path, Buffer.from(bytes)); }, download: async () => [state.stored.get(path)] }) }) }));
vi.mock('@/lib/liv/public-media-reader', () => ({ readChatGptImage: (...args: unknown[]) => state.download(...args), readPublicMedia: (...args: unknown[]) => state.readback(...args),
  readPressMedia: async (url: string) => ({ bytes: await state.download(url), finalUrl: url, contentType: 'image/png', status: 200 }) }));
vi.mock('@/lib/image-gen/cms-asset', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/image-gen/cms-asset')>(), uploadImageGenCmsAsset: (...args: unknown[]) => state.upload(...args) }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => ({ authors: [], categories: [], topics: [], requiredFields: [], checkedAt: '' }) }));
import { importChatImage } from '@/lib/editorial/chat-image-import';
import { updateSubmission, getSubmissionStatus } from '@/lib/editorial/submissions';
import { readImageGenSnapshot } from '@/lib/image-gen/snapshot';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { importSubmissionPressImage, previewSubmissionPressImage } from '@/lib/editorial/press-image-import';
import { IMAGE_HANDOFF_VERSION, promptHash } from '@/lib/editorial/image-generation-evidence';
import { getChatImageBrief } from '@/lib/editorial/chat-image-brief';
const id = 'a'.repeat(64), version = 'b'.repeat(64), path = `editorialSubmissions/${id}`, briefId = 'c'.repeat(64);
let memory: ReturnType<typeof memoryFirestore>;
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubEnv('FIREBASE_STORAGE_BUCKET', 'test-bucket'); memory = memoryFirestore(); state.db = memory.db; state.stored.clear();
  state.bytes = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#005a82' } }).png().toBuffer();
  state.download.mockResolvedValue(state.bytes);
  state.boundCover.mockResolvedValue(null);
  state.upload.mockImplementation(async (bytes: Buffer, name: string, saved: (asset: any) => Promise<void>) => {
    const asset = { id: 'cms-asset', url: `https://cdn.prod.website-files.com/test/${name}` };
    state.readback.mockResolvedValue(bytes); await saved(asset); return asset;
  });
  const article = { title: 'En koncert', content: '<p>Første   afsnit med en konkret scene.</p><p>Det næste afsnit.</p>', subjectType: 'music' };
  memory.rows.set(path, { id, uid: 'team', revision: 1, status: 'draft', contentHash: version, requestId: 'original-article-0001',
    article, originalArticle: article, research: [], choices: { kind: 'feature', media: 'illustration', style: 'expressive' } });
  state.sectionId = (await readImageGenSnapshot('team', `submission-${id}`)).article.sections[0].id;
});
afterEach(() => vi.unstubAllEnvs());
const input = () => ({ submissionId: id, expectedRevision: 1, requestId: 'import-chat-image-0001',
  file: { download_url: 'https://files.oaiusercontent.com/image?signature=PRIVATE', file_id: 'file-personal-image', mime_type: 'image/png' },
  kind: 'illustration', role: 'cover', origin: 'chatgpt-generated', briefId, sectionId: state.sectionId,
  generationReport: { effectivePrompt: 'Flat colours, no 3D.', referenceHashes: [createHash('sha256').update(state.bytes).digest('hex')],
    outputCheck: { sha256: createHash('sha256').update(state.bytes).digest('hex'), inspected: true, imageType: 'standalone-illustration', singleImage: true,
      textVisible: false, logosVisible: false, watermarkVisible: false } },
  alt: 'En illustration af koncerten', caption: 'Koncerten', credit: 'User supplied' });
async function brief(role = 'cover', sectionId?: string) {
  const referenceHash = createHash('sha256').update(state.bytes).digest('hex');
  state.stored.set('reference/original', state.bytes);
  memory.rows.set(`${path}/chatBriefs/${briefId}`, { uid: 'team', submissionId: id, expectedRevision: 1, contentHash: version, role, sectionId: sectionId || state.sectionId,
    handoffVersion: IMAGE_HANDOFF_VERSION, prompt: input().generationReport.effectivePrompt, canonicalPromptHash: promptHash(input().generationReport.effectivePrompt), referenceHash,
    requiredReferenceHashes: [referenceHash], retainedReferences: [{ sha256: referenceHash, storagePath: 'reference/original', mimeType: 'image/png' }] });
}
function pressInput() {
  const sha256 = createHash('sha256').update(state.bytes).digest('hex');
  memory.rows.set(`${path}/pressSearches/${version}`, { policyVersion: 'press-raster-v2', candidates: [{ id: briefId, originalUrl: 'https://museum.dk/photo.png',
    sourceUrl: 'https://museum.dk/press', downloadUrl: 'https://museum.dk/photo.png', credit: 'Daniel Rasmussen', caption: 'Udstillingen. Foto: Daniel Rasmussen',
    validation: 'decoded', mimeType: 'image/png', sha256, byteCount: state.bytes.length, width:1200, height:800, rightsStatus:'unknown', usageTerms:[] }] });
  return { submissionId: id, searchId: version, candidateId: briefId, expectedRevision: 1, requestId: 'press-image-test-0001',
    role: 'cover', alt: 'Udstillingsrummet på museet', caption: 'Udstillingen', visualCheck: { relevant: true, coverTextFree: true } };
}
it('imports verified press bytes through the same durable operation; replay preserves originals, metadata and credit', async () => {
  const input = pressInput(), article = structuredClone(memory.rows.get(path).article);
  const preview = await previewSubmissionPressImage('team', { submissionId:id,searchId:version,candidateId:briefId });
  expect(preview.image.data.length).toBeGreaterThan(0); expect(state.upload).not.toHaveBeenCalled();
  const first = await importSubmissionPressImage('team', input);
  expect(first).toMatchObject({ revision:2, paidAiCalls:0, provenance:'verified-public-press-bytes', publicationApproval:false });
  expect(await importSubmissionPressImage('team', input)).toMatchObject({ replay:true,revision:2 });
  expect(state.upload).toHaveBeenCalledTimes(1); expect(memory.rows.get(path).article.content).toBe(article.content);
  const saved = memory.rows.get(`${path}/chatAssets/${first.assetId}`);
  expect(saved).toMatchObject({ origin:'press-source', originalHash:preview.candidate.sha256, byteCount:state.bytes.length, rightsStatus:'unknown', credit:'Foto: Daniel Rasmussen' });
  expect(saved.sourceEvidence.visualCheckSource).toBe('agent_reported_not_personal_approval');
  expect(memory.rows.get(path).approval).toBeUndefined();
  await expect(importSubmissionPressImage('team', { ...input, requestId:'press-another-request',expectedRevision:2 })).rejects.toThrow('press_import_exists');
  expect(state.upload).toHaveBeenCalledTimes(1);
});
it('press timeout resumes retained bytes and CDN receipt, never allocates another asset', async () => {
  const input = pressInput();
  state.upload.mockImplementationOnce(async (bytes, _name, checkpoint) => {
    await checkpoint({ id:'real',url:'https://cdn.prod.website-files.com/test/real.png' }); state.readback.mockResolvedValue(bytes); throw Error('lost response');
  });
  await expect(importSubmissionPressImage('team', input)).rejects.toThrow('asset_upload_unconfirmed');
  expect(await importSubmissionPressImage('team', input)).toMatchObject({ revision:2 });
  expect(state.upload).toHaveBeenCalledTimes(1); expect(state.download).toHaveBeenCalledTimes(1);
});
it('press recovery can rebase an unchanged intent after a concurrent edit without uploading twice', async () => {
  const input = pressInput();
  state.upload.mockImplementationOnce(async (bytes, _name, checkpoint) => {
    await checkpoint({ id:'real',url:'https://cdn.prod.website-files.com/test/real.png' }); state.readback.mockResolvedValue(bytes); throw Error('lost response');
  });
  await expect(importSubmissionPressImage('team', input)).rejects.toThrow('asset_upload_unconfirmed');
  memory.rows.get(path).revision = 2; memory.rows.get(path).article.subtitle = 'Concurrent edit';
  const result = await importSubmissionPressImage('team', { ...input, expectedRevision:2 });
  expect(result.revision).toBe(3); expect(state.upload).toHaveBeenCalledTimes(1); expect(state.download).toHaveBeenCalledTimes(1);
  expect(memory.rows.get(path).article.subtitle).toBe('Concurrent edit');
});
it('blocks stale versions, unverified old search results, changed bytes and non-text-free covers before CMS', async () => {
  const input = pressInput();
  await expect(importSubmissionPressImage('team', { ...input,expectedRevision:2 })).rejects.toThrow('revision_conflict');
  await expect(importSubmissionPressImage('team', { ...input,visualCheck:{ relevant:true,coverTextFree:false } })).rejects.toThrow('cover_visible_text');
  memory.rows.get(`${path}/pressSearches/${version}`).policyVersion = 'legacy';
  await expect(importSubmissionPressImage('team', input)).rejects.toThrow('candidate_unverified');
  pressInput(); state.download.mockResolvedValue(await sharp({ create:{width:1200,height:800,channels:3,background:'red'} }).png().toBuffer());
  await expect(importSubmissionPressImage('team', input)).rejects.toThrow('press_source_changed');
  expect(state.upload).not.toHaveBeenCalled(); expect(memory.rows.get(path).revision).toBe(1);
});
it('binds a press body image to the exact current section and refuses another owner', async () => {
  const input = pressInput();
  await expect(importSubmissionPressImage('other', input)).rejects.toThrow('not_found');
  const snapshot = await readImageGenSnapshot('team', `submission-${id}`);
  const result = await importSubmissionPressImage('team', { ...input,role:'body',sectionId:snapshot.article.sections[0].id,visualCheck:{relevant:true,coverTextFree:false} });
  expect(result.revision).toBe(2);
  const content = memory.rows.get(path).article.content;
  expect(content).toContain('Første   afsnit'); expect(content).toContain('Foto: Daniel Rasmussen');
  expect(content.indexOf('<figure')).toBeLessThan(content.indexOf('Det næste'));
});
it('retains the private original and attaches a durable CMS asset once, without persisting signed URLs or claiming prompt verification', async () => {
  await brief(); const first = await importChatImage('team', input());
  expect(first).toMatchObject({ revision: 2, paidAiCalls: 0, publicationApproval: false });
  expect(await importChatImage('team', { ...input(), file: { ...input().file, download_url: 'https://files.oaiusercontent.com/new?signature=changed' } })).toMatchObject({ replay: true, revision: 2 });
  expect(state.upload).toHaveBeenCalledTimes(1); expect(state.download).toHaveBeenCalledTimes(1);
  expect([...state.stored.values()][0]).toEqual(state.bytes);
  expect(state.upload.mock.calls[0][0]).toEqual(state.bytes);
  expect(state.upload.mock.calls[0][1]).toMatch(/\.png$/);
  expect(state.upload.mock.calls[0][3]).toEqual({ preserveOriginal: true });
  const saved = JSON.stringify([...memory.rows]);
  expect(saved).not.toContain('PRIVATE'); expect(saved).not.toContain('download_url');
  expect(saved).toContain('chatgpt-supplied-unverified');
  expect(memory.rows.get(path).article.content).toBe(memory.rows.get(path).originalArticle.content);
  expect(first.generationEvidence).toMatchObject({ status: 'client_reported_match', requiresPersonalSelection: false, exactPromptExecutionVerified: false });
  expect((await getSubmissionStatus('team', id)).imageSelection.required).toBe(false);
});
it('rejects a mismatched new report before any download or CMS upload, preserving existing records', async () => {
  await brief(); const before = JSON.stringify([...memory.rows]);
  await expect(importChatImage('team', { ...input(), generationReport: { ...input().generationReport, effectivePrompt: 'Cinematic watercolor.' } })).rejects.toThrow('canonical_prompt_mismatch');
  expect(state.download).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled();
  expect(JSON.stringify([...memory.rows])).toBe(before);
});
it('uses exact paragraph identity and preserves all other text and assets', async () => {
  const { article } = await readImageGenSnapshot('team', `submission-${id}`), sectionId = article.sections[0].id;
  await brief('body', sectionId);
  await importChatImage('team', { ...input(), role: 'body', sectionId });
  const content = memory.rows.get(path).article.content;
  expect(content).toContain('Første   afsnit'); expect(content.indexOf('<figure')).toBeLessThan(content.indexOf('Det næste'));
  expect(content).toContain('Illustration: Apropos Magazine / AI');
});
it('replays an attached native file under a rotated file ID only after exact byte verification', async () => {
  await brief(); const first = await importChatImage('team', input());
  const next = { ...input(), file: { ...input().file, file_id: 'file-rotated', download_url: 'https://files.oaiusercontent.com/new?secret=ROTATED' } };
  expect(await importChatImage('team', next)).toMatchObject({ replay: true, assetId: first.assetId, revision: 2 });
  expect(state.upload).toHaveBeenCalledTimes(1); expect(state.download).toHaveBeenCalledTimes(2);
  expect([...memory.rows.values()].some(row => row.source === 'native_reference_exact_bytes')).toBe(true);
  expect(JSON.stringify([...memory.rows])).not.toContain('ROTATED');
  expect(memory.rows.get(`${path}/chatAssets/${first.assetId}`).fileId).toBe(input().file.file_id);
});
it('rejects changed bytes under a rotated native reference without changing the saved operation', async () => {
  await brief(); const first = await importChatImage('team', input());
  state.download.mockResolvedValue(Buffer.from('a different file'));
  await expect(importChatImage('team', { ...input(), file: { ...input().file, file_id: 'file-different' } })).rejects.toThrow('idempotency_conflict');
  expect(state.upload).toHaveBeenCalledTimes(1); expect(memory.rows.get(path).revision).toBe(2);
  expect(memory.rows.get(`${path}/chatAssets/${first.assetId}`).fileId).toBe(input().file.file_id);
  expect([...memory.rows.values()].some(row => row.source === 'native_reference_exact_bytes')).toBe(false);
});
it('rejects changed instructions before downloading a rotated native reference', async () => {
  await brief(); await importChatImage('team', input());
  await expect(importChatImage('team', { ...input(), credit: 'Different credit', file: { ...input().file, file_id: 'file-rotated' } })).rejects.toThrow('idempotency_conflict');
  expect(state.download).toHaveBeenCalledTimes(1); expect(state.upload).toHaveBeenCalledTimes(1);
});
it('refuses changed version, foreign owner, missing brief, film illustration and an edited request identity before downloading', async () => {
  await brief();
  await expect(importChatImage('other', input())).rejects.toThrow('not_found');
  await expect(importChatImage('team', { ...input(), expectedRevision: 2 })).rejects.toThrow('revision_conflict');
  await expect(importChatImage('team', { ...input(), briefId: undefined })).rejects.toThrow('brief_required');
  memory.rows.get(path).article.subjectType = 'film';
  await expect(importChatImage('team', input())).rejects.toThrow('film_requires_real_stills');
  expect(state.download).not.toHaveBeenCalled();
});
it('recovers uploaded bytes after transport timeout without another CMS allocation', async () => {
  await brief();
  const normal = state.upload.getMockImplementation()!;
  state.upload.mockImplementation(async (...args: any[]) => { await normal(...args); throw Error('timeout'); });
  await expect(importChatImage('team', input())).rejects.toThrow('asset_upload_unconfirmed');
  const result = await importChatImage('team', input());
  expect(result.revision).toBe(2); expect(state.upload).toHaveBeenCalledTimes(1); expect(state.readback).toHaveBeenCalledTimes(1);
});
it('recovers a committed attachment receipt even if acknowledgement was lost', async () => {
  await brief();
  const result = await importChatImage('team', input());
  const assetId = cmsFieldHash({ uid: 'team', id, requestId: input().requestId });
  memory.rows.get(`${path}/chatAssets/${assetId}`).status = 'uploaded';
  expect(await importChatImage('team', input())).toMatchObject({ revision: result.revision, replay: true });
  expect(memory.rows.get(path).revision).toBe(2); expect(state.upload).toHaveBeenCalledTimes(1);
});
it('does not allocate twice when CMS allocation itself is ambiguous', async () => {
  await brief(); state.upload.mockRejectedValue(Error('timeout'));
  await expect(importChatImage('team', input())).rejects.toThrow('asset_upload_unconfirmed');
  await expect(importChatImage('team', input())).rejects.toThrow('upload_unconfirmed');
  expect(state.upload).toHaveBeenCalledTimes(1);
});
it('rejects small image bytes before storage or upload', async () => {
  await brief();
  state.download.mockResolvedValue(await sharp({ create: { width: 100, height: 100, channels: 3, background: 'red' } }).png().toBuffer());
  await expect(importChatImage('team', input())).rejects.toThrow('image_invalid');
  expect(state.upload).not.toHaveBeenCalled();
});
it('accepts an existing user-upload without inventing a generation brief or credit', async () => {
  const result = await importChatImage('team', { ...input(), kind: 'photo', generationReport: undefined, briefId: undefined, origin: 'user-upload', credit: 'Foto: Frederik' });
  expect(result.revision).toBe(2); expect(memory.rows.get(path).article.fotoCredit).toBe('Foto: Frederik');
  await expect(updateSubmission('team', { submissionId: id, expectedRevision: 2, requestId: 'silent-replacement-0001',
    article: { featuredImage: 'https://cdn.test/fallback.jpg' } })).rejects.toThrow('selected_asset_locked');
  expect(memory.rows.get(path).article.featuredImage).toBe(result.url);
});
it('rejects new unspecified origins without guessing whether a file was generated', async () => {
  await expect(importChatImage('team', { ...input(), origin: undefined, briefId: undefined })).rejects.toThrow('image_origin_required');
  expect(state.download).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled();
});
it.each(['jpeg', 'png', 'webp'] as const)('sniffs %s bytes when the adapter labels them binary', async format => {
  state.bytes = await sharp({ create: { width: 1280, height: 720, channels: 3, background: 'beige' } }).toFormat(format).toBuffer();
  state.download.mockResolvedValue(state.bytes);
  const result = await importChatImage('team', { ...input(), kind: 'photo', generationReport: undefined, origin: 'user-upload', briefId: undefined, file: { ...input().file, mime_type: 'application/octet-stream' } });
  expect(state.upload.mock.calls[0][0]).toEqual(state.bytes); expect(result.revision).toBe(2);
});
it('marks ghost uploads unconfirmed and never silently reallocates or changes the article', async () => {
  await brief();
  state.upload.mockImplementation(async (_bytes, _name, checkpoint) => {
    await checkpoint({ id: 'ghost', url: 'https://cdn.test/zero.png' }); throw Error('S3 secret response');
  });
  await expect(importChatImage('team', input())).rejects.toThrow('asset_upload_unconfirmed');
  const saved = [...memory.rows.entries()].find(([key]) => key.includes('/chatAssets/'))![1];
  expect(saved.failure).toMatchObject({ assetReady: false, originalPreserved: true, stage: 'cms_asset_upload' });
  expect(JSON.stringify(saved)).not.toContain('secret response');
  state.readback.mockResolvedValue(Buffer.alloc(0));
  await expect(importChatImage('team', input())).rejects.toThrow('upload_unconfirmed');
  expect(state.upload).toHaveBeenCalledTimes(1); expect(memory.rows.get(path).revision).toBe(1);
});
it('resumes the same ambiguous import with identical bytes already on the bound article, without another allocation', async () => {
  memory.rows.get(path).publishedTarget = { itemId: 'c'.repeat(24), fields: {}, fieldDataHash: 'd'.repeat(64) };
  await brief(); state.upload.mockRejectedValueOnce(Error('timeout'));
  await expect(importChatImage('team', input())).rejects.toThrow('asset_upload_unconfirmed');
  state.boundCover.mockResolvedValue({ id: 'e'.repeat(24), url: 'https://cdn.test/already-published.png' });
  state.readback.mockResolvedValue(state.bytes);
  const result = await importChatImage('team', { ...input(), file: { ...input().file, file_id: 'file-rotated-on-retry' } });
  expect(result.url).toBe('https://cdn.test/already-published.png');
  expect(state.upload).toHaveBeenCalledTimes(1); expect(state.download).toHaveBeenCalledTimes(2);
  expect([...memory.rows.values()].some(row => row.previousFailure?.code === 'mcp_submission_asset_upload_unconfirmed')).toBe(true);
});

it.each([
  ['missing report', (v: any) => ({ ...v, generationReport: undefined }), 'generation_report_required'],
  ['generated photo', (v: any) => ({ ...v, kind: 'photo' }), 'generated_image_type_invalid'],
  ['cover section mismatch', (v: any) => ({ ...v, sectionId: 'd'.repeat(64) }), 'generation_brief_invalid'],
  ['missing actual style', (v: any) => ({ ...v, generationReport: { ...v.generationReport, referenceHashes: [] } }), 'references_mismatch'],
  ['extra reference', (v: any) => ({ ...v, generationReport: { ...v.generationReport, referenceHashes: [...v.generationReport.referenceHashes, 'd'.repeat(64)] } }), 'references_mismatch'],
  ['wrapper', (v: any) => ({ ...v, generationReport: { ...v.generationReport, technicalWrapper: 'landscape' } }), 'canonical_prompt_mismatch'],
  ['no inspection', (v: any) => ({ ...v, generationReport: { ...v.generationReport, outputCheck: undefined } }), 'output_inspection_required'],
  ['edit without original', (v: any) => ({ ...v, origin: 'chatgpt-edited' }), 'parent_required'],
] as const)('rejects %s before download/upload', async (_name, change, error) => {
  await brief(); await expect(importChatImage('team', change(input()))).rejects.toThrow(error);
  expect(state.download).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled(); expect(memory.rows.get(path).revision).toBe(1);
});
it.each([
  { imageType: 'collage' }, { imageType: 'article-mockup' }, { imageType: 'photo' },
  { textVisible: true }, { logosVisible: true }, { watermarkVisible: true }, { singleImage: false },
])('rejects disallowed inspected output %j before upload', async patch => {
  await brief(); const value = input();
  await expect(importChatImage('team', { ...value, generationReport: { ...value.generationReport, outputCheck: { ...value.generationReport.outputCheck, ...patch } } })).rejects.toThrow('generated_image_type_invalid');
  expect(state.upload).not.toHaveBeenCalled(); expect(state.download).not.toHaveBeenCalled();
});
it('binds the inspection to the original bytes rather than a different approved-looking image', async () => {
  await brief(); const value = input();
  await expect(importChatImage('team', { ...value, generationReport: { ...value.generationReport, outputCheck: { ...value.generationReport.outputCheck, sha256: '0'.repeat(64) } } })).rejects.toThrow('inspected_image_mismatch');
  expect(state.upload).not.toHaveBeenCalled(); expect(memory.rows.get(path).revision).toBe(1);
});
it('fails closed on a legacy brief or a lost/changed actual style reference, without upgrading history', async () => {
  await brief(); const stored = memory.rows.get(`${path}/chatBriefs/${briefId}`);
  stored.handoffVersion = 'canonical-native-image-v1';
  await expect(importChatImage('team', input())).rejects.toThrow('generation_brief_invalid');
  stored.handoffVersion = IMAGE_HANDOFF_VERSION; state.stored.set('reference/original', Buffer.from('HTML, not the style image'));
  await expect(importChatImage('team', input())).rejects.toThrow('reference_changed');
  expect(state.upload).not.toHaveBeenCalled();
});
it.each(['current', 'selection', 'consent', 'historical'])('never replaces an image protected by %s personal approval', async mode => {
  const url = 'https://cdn.test/approved.png', row = memory.rows.get(path); row.article.featuredImage = url;
  const approval = { uid: 'team', contentHash: version, acceptedAt: '2026-10-13T10:00:00Z' };
  if (mode === 'current') row.approval = approval;
  if (mode === 'selection') memory.rows.set(`${path}/mediaSelections/selected`, { uid: 'team', acceptedAt: approval.acceptedAt, items: [{ url }] });
  if (mode === 'consent') memory.rows.set(`${path}/publicationConsents/approved`, { uid: 'team', acceptedAt: approval.acceptedAt, media: [{ url }] });
  if (mode === 'historical') memory.rows.set(`${path}/versions/old`, { ...structuredClone(row), approval });
  await expect(importChatImage('team', { ...input(), origin: 'user-upload', kind: 'photo', briefId: undefined, generationReport: undefined })).rejects.toThrow('approved_image_locked');
  expect(state.upload).not.toHaveBeenCalled(); expect(state.download).not.toHaveBeenCalled(); expect(row.article.featuredImage).toBe(url);
});
it('rechecks approval inside the attachment transaction when it arrives during upload', async () => {
  await brief(); const url = 'https://cdn.test/approved.png'; memory.rows.get(path).article.featuredImage = url;
  const normal = state.upload.getMockImplementation()!;
  state.upload.mockImplementation(async (...args: any[]) => {
    const uploaded = await normal(...args);
    memory.rows.get(path).approval = { uid: 'team', contentHash: version, acceptedAt: '2026-10-13T10:00:00Z' };
    return uploaded;
  });
  await expect(importChatImage('team', input())).rejects.toThrow('approved_image_locked');
  const asset = [...memory.rows.values()].find(r => r.assetId);
  expect(asset.status).toBe('uploaded'); expect(state.stored.get(asset.storagePath)).toEqual(state.bytes);
  expect(memory.rows.get(path).article.featuredImage).toBe(url); expect(memory.rows.get(path).revision).toBe(1);
  await expect(importChatImage('team', input())).rejects.toThrow('approved_image_locked'); expect(state.upload).toHaveBeenCalledTimes(1);
});
it('uses a real canonical brief and actual style bytes through native import and replay, without an AI call or approval', async () => {
  const { article } = await readImageGenSnapshot('team', `submission-${id}`), section = article.sections[0];
  const result = await getChatImageBrief('team', { submissionId: id, expectedRevision: 1, role: 'cover', sectionId: section.id,
    excerpt: section.text, description: 'En stiliseret scene med publikum i forgrunden.' });
  const value = { ...input(), briefId: result.brief.briefId, generationReport: { ...input().generationReport,
    effectivePrompt: result.brief.prompt, referenceHashes: result.brief.requiredReferenceHashes } };
  const imported = await importChatImage('team', value);
  expect(imported).toMatchObject({ revision: 2, publicationApproval: false, paidAiCalls: 0 });
  expect(imported.generationEvidence).toMatchObject({ status: 'client_reported_match', exactPromptExecutionVerified: false });
  expect(await importChatImage('team', value)).toMatchObject({ replay: true, assetId: imported.assetId });
  const saved = memory.rows.get(`${path}/chatAssets/${imported.assetId}`);
  expect(saved.generationReport).toEqual(value.generationReport); expect(saved.briefId).toBe(result.brief.briefId);
  expect(state.stored.get(saved.storagePath)).toEqual(state.bytes); expect(state.upload).toHaveBeenCalledTimes(1);
  expect(memory.rows.get(path).approval).toBeUndefined();
});
it('keeps completed pre-contract imports replayable without retroactive evidence or another upload', async () => {
  const value = { ...input(), origin: 'unspecified', briefId: undefined, sectionId: undefined, generationReport: undefined };
  const { file, ...metadata } = value, assetId = cmsFieldHash({ uid: 'team', id, requestId: value.requestId });
  const previous = { uid: 'team', assetId, status: 'attached', revision: 2, fileId: file.file_id,
    requestHash: cmsFieldHash({ ...metadata, fileId: file.file_id }), url: 'https://cdn.test/legacy.png', originalHash: 'a'.repeat(64) };
  memory.rows.set(`${path}/chatAssets/${assetId}`, previous);
  expect(await importChatImage('team', value)).toMatchObject({ replay: true, revision: 2, generationEvidence: null });
  expect(memory.rows.get(`${path}/chatAssets/${assetId}`)).toEqual(previous);
  expect(state.download).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled();
});
it('rejects HTML disguised as an image with a concrete error', async () => {
  state.download.mockResolvedValue(Buffer.from('<html>Login required</html>'));
  await expect(importChatImage('team', { ...input(), kind: 'photo', origin: 'user-upload', briefId: undefined, generationReport: undefined })).rejects.toThrow('image_invalid');
  expect(state.upload).not.toHaveBeenCalled(); expect(state.stored.size).toBe(0);
});
