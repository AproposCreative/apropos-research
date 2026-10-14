import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { memoryFirestore } from './helpers/mcp-firestore';
const state = vi.hoisted(() => ({ db: null as any, files: new Map<string, Buffer>(), download: vi.fn(), upload: vi.fn(), loseSaveReply: false }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db, getAdminStorageBucket: () => ({ file: (path: string) => ({
  save: async (bytes: Buffer) => { state.files.set(path, bytes); if (state.loseSaveReply) throw Error('timeout'); },
  download: async () => { if (!state.files.has(path)) throw Error('missing'); return [state.files.get(path)]; },
}) }) }));
vi.mock('@/lib/liv/public-media-reader', () => ({ readChatGptImage: (...args: any[]) => state.download(...args) }));
vi.mock('@/lib/image-gen/cms-asset', async original => ({ ...await original<any>(), uploadImageGenCmsAsset: (...args: any[]) => state.upload(...args) }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => ({ authors: [], categories: [], topics: [] }) }));
import { preflightSubmissionImage, imagePreflightInput } from '@/lib/editorial/image-preflight';
import { assertGenerationContract, IMAGE_HANDOFF_VERSION, promptHash } from '@/lib/editorial/image-generation-evidence';
import { assertNativeImageIntegration } from '@/lib/editorial/native-image-integration';
import { importChatImage } from '@/lib/editorial/chat-image-import';
import { imageProtectedContentHash, assertImageContentInvariant } from '@/lib/editorial/image-content-invariant';
import { readImageFailures, previewImageFailure, retainRejectedImage } from '@/lib/editorial/image-failure';
import { readImageGenSnapshot } from '@/lib/image-gen/snapshot';
import { prepareSubmission, updateSubmission } from '@/lib/editorial/submissions';
import { validateReference } from '@/lib/editorial/image-reference';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const id = 'a'.repeat(64), briefId = 'b'.repeat(64), subjectId = 'c'.repeat(64), path = `editorialSubmissions/${id}`;
let memory: ReturnType<typeof memoryFirestore>, input: any, brief: any, generated: any, bytes: Buffer;
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubEnv('FIREBASE_STORAGE_BUCKET', 'test-only'); state.files.clear(); state.loseSaveReply = false;
  memory = memoryFirestore(); state.db = memory.db;
  const article = { title: 'Brugerens uændrede artikel', subtitle: 'Undertitel', intro: 'Intro',
    content: '<p>Det første afsnit med brugerens egne ord.</p><h2>Næste afsnit</h2><p>Også uændret.</p>',
    author: 'Frederik', category: 'Kultur', seoTitle: 'SEO titel', seoDescription: 'En beskrivelse', slug: 'original-slug', subjectType: 'culture' };
  memory.rows.set(path, { id, uid: 'owner', revision: 2, status: 'draft', contentHash: 'd'.repeat(64),
    article, originalArticle: article, requestId: 'original-submission', choices: { kind: 'commentary', media: 'illustration', aiFinalChecks: 'human' }, research: [] });
  const snapshot = await readImageGenSnapshot('owner', `submission-${id}`);
  bytes = await sharp({ create: { width: 1200, height: 800, channels: 3, background: 'blue' } }).png().toBuffer();
  const subjectBytes = await sharp({ create: { width: 900, height: 700, channels: 3, background: 'red' } }).jpeg().toBuffer();
  const style = { ...await validateReference(bytes), storagePath: 'private/style', purpose: 'style' };
  const subject = { ...await validateReference(subjectBytes), storagePath: 'private/subject', purpose: 'subject' };
  state.files.set(style.storagePath, bytes); state.files.set(subject.storagePath, subjectBytes);
  memory.rows.set(`${path}/imageReferences/${subjectId}`, { uid: 'owner', submissionId: id, purpose: 'user-uploaded-subject-photo', reference: subject });
  input = { submissionId: id, expectedRevision: 2, role: 'cover', sectionId: snapshot.article.sections[0].id, briefId,
    subjectReferencesRequired: true, subjectReferenceIds: [subjectId] };
  brief = { ...input, uid: 'owner', contentHash: 'd'.repeat(64), protectedContentHash: imageProtectedContentHash(article),
    handoffVersion: IMAGE_HANDOFF_VERSION, prompt: 'Exact canonical prompt. One coherent scene.', referenceHash: style.sha256,
    canonicalPromptHash: promptHash('Exact canonical prompt. One coherent scene.'), retainedReferences: [style, subject], requiredReferenceHashes: [style.sha256, subject.sha256] };
  memory.rows.set(`${path}/chatBriefs/${briefId}`, brief);
  generated = { submissionId: id, expectedRevision: 2, role: 'cover', sectionId: input.sectionId, briefId,
    requestId: 'original-image-attempt', kind: 'illustration', origin: 'chatgpt-generated',
    file: { file_id: 'file-original', download_url: 'https://files.oaiusercontent.com/original?secret=PRIVATE' },
    alt: 'Motivet', caption: 'Beskrivelse', credit: 'Apropos AI',
    generationReport: { effectivePrompt: brief.prompt, referenceHashes: brief.requiredReferenceHashes,
      outputCheck: { sha256: style.sha256, inspected: true, imageType: 'standalone-illustration', singleImage: true,
        textVisible: false, logosVisible: false, watermarkVisible: false, photorealistic: false, photographicFragments: false, rendered3d: false,
        coherentScene: true, panelCount: 1, styleMatch: 'match', subjectMatch: 'match' } } };
  state.download.mockResolvedValue(bytes);
});
afterEach(() => vi.unstubAllEnvs());

it('a complete read-only preflight STILL blocks the unobservable native host; no paid work, article or reference writes', async () => {
  const before = cmsFieldHash([...memory.rows]); const result = await preflightSubmissionImage('owner', input);
  expect(result).toMatchObject({ inputsComplete: true, canGenerate: false, canImportGeneratedImage: false, paidAiCalls: 0,
    publicationApproval: false, integration: { exactPromptExecutionVerified: false, inputObservation: 'unavailable' } });
  expect(result.blockers).toEqual(['mcp_submission_native_input_unverifiable']);
  expect(result.references.map(r => r.purpose)).toEqual(['style', 'subject']);
  expect(cmsFieldHash([...memory.rows])).toBe(before); expect(state.download).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled();
});
it.each([
  [{ briefId: undefined }, 'brief_required'],
  [{ submissionId: 'e'.repeat(64) }, 'not_found'],
  [{ expectedRevision: 1 }, 'revision_conflict'],
  [{ sectionId: 'e'.repeat(64) }, 'anchor_changed'],
  [{ role: 'body' }, 'generation_brief_invalid'],
  [{ subjectReferenceIds: [] }, 'subject_reference_required'],
])('rejects missing/wrong binding %j', async (patch, error) => {
  if (error === 'not_found') await expect(preflightSubmissionImage('owner', { ...input, ...patch })).rejects.toThrow(error);
  else {
    const result = await preflightSubmissionImage('owner', { ...input, ...patch });
    expect(result.blockers).toContain(`mcp_submission_${error}`); expect(result.canGenerate).toBe(false);
  }
});
it('does not expose another person’s private article/references', async () => {
  await expect(preflightSubmissionImage('other', input)).rejects.toThrow('not_found');
  await expect(importChatImage('other', generated)).rejects.toThrow('not_found');
  expect(state.download).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled();
});
it('reports an old brief without a protected-content baseline as invalid, not as an actual article mutation', async () => {
  delete brief.protectedContentHash;
  const before = cmsFieldHash(memory.rows.get(path));
  const result = await preflightSubmissionImage('owner', input);
  expect(result.blockers).toContain('mcp_submission_generation_brief_invalid');
  expect(result.blockers).not.toContain('mcp_submission_image_content_changed');
  expect(result.canGenerate).toBe(false); expect(cmsFieldHash(memory.rows.get(path))).toBe(before);
});
it.each(['missing', 'hash-only', 'wrong-bytes', 'wrong-purpose'])('requires actual STYLE_REFERENCE bytes: %s', async mode => {
  if (mode === 'missing') state.files.delete('private/style');
  if (mode === 'hash-only') brief.retainedReferences[0] = { sha256: brief.referenceHash, purpose: 'style' };
  if (mode === 'wrong-bytes') state.files.set('private/style', Buffer.from('<html>blocked</html>'));
  if (mode === 'wrong-purpose') brief.retainedReferences[0].purpose = 'subject';
  const result = await preflightSubmissionImage('owner', input);
  expect(result.inputsComplete).toBe(false); expect(result.blockers).toContain('mcp_submission_style_reference_required');
});
it('a subject hash cannot replace the original uploaded photo or masquerade as style', async () => {
  state.files.delete('private/subject');
  expect((await preflightSubmissionImage('owner', input)).blockers).toContain('mcp_submission_reference_missing');
  memory.rows.get(`${path}/imageReferences/${subjectId}`).uid = 'other';
  expect((await preflightSubmissionImage('owner', input)).blockers).toContain('mcp_submission_subject_reference_required');
});
it.each(['Shortened', 'Oversat prompt', 'Exact canonical prompt. One coherent scene. More drama.'])('rejects modified client-observable prompt: %s', prompt => {
  expect(() => assertGenerationContract({ ...generated, generationReport: { ...generated.generationReport, effectivePrompt: prompt } }, brief)).toThrow('canonical_prompt_mismatch');
});
it.each([
  { imageType: 'collage' }, { imageType: 'article-mockup' }, { imageType: 'magazine-cover' }, { imageType: 'ui-design' },
  { textVisible: true }, { logosVisible: true }, { watermarkVisible: true }, { photorealistic: true }, { photographicFragments: true },
  { rendered3d: true }, { singleImage: false }, { panelCount: 4 }, { coherentScene: false }, { styleMatch: 'mismatch' }, { subjectMatch: 'mismatch' },
])('rejects declared unacceptable output %j (not an independent pixel classifier)', patch => {
  const value = { ...generated, generationReport: { ...generated.generationReport, outputCheck: { ...generated.generationReport.outputCheck, ...patch } } };
  expect(() => assertGenerationContract(value, brief)).toThrow('generated_image_type_invalid');
});
it('unknown semantic review cannot be declared passed', () => {
  const value = { ...generated, generationReport: { ...generated.generationReport, outputCheck: { ...generated.generationReport.outputCheck, styleMatch: 'not_reviewed' } } };
  expect(() => assertGenerationContract(value, brief)).toThrow('output_inspection_required');
});
it('rejects honest-looking client attestations; preserves the rejected original and receipt, never CMS', async () => {
  const articleBefore = cmsFieldHash(memory.rows.get(path));
  await expect(importChatImage('owner', generated)).rejects.toThrow('native_input_unverifiable');
  const failures = await readImageFailures('owner', id);
  expect(failures).toHaveLength(1); expect(failures[0]).toMatchObject({ originalPreserved: true, originalHash: generated.generationReport.outputCheck.sha256,
    code: 'mcp_submission_native_input_unverifiable', automaticRetryAllowed: false });
  const preview = await previewImageFailure('owner', { submissionId: id, failureId: failures[0].failureId });
  expect(Buffer.from(preview.image.data, 'base64')).toEqual(bytes);
  expect(state.upload).not.toHaveBeenCalled(); expect(cmsFieldHash(memory.rows.get(path))).toBe(articleBefore);
  expect([...memory.rows.keys()].some(k => /chatAssets|publicationConsents|versions/.test(k))).toBe(false);
  expect(JSON.stringify([...memory.rows])).not.toContain('PRIVATE');
});
it('retains a visually rejected original rather than dropping it before validation', async () => {
  generated.generationReport.outputCheck.imageType = 'collage';
  await expect(importChatImage('owner', generated)).rejects.toThrow('generated_image_type_invalid');
  expect((await readImageFailures('owner', id))[0]).toMatchObject({ originalPreserved: true, code: 'mcp_submission_generated_image_type_invalid' });
});
it('same request and a NEW request cannot regenerate/reupload after failure; preflight retains the stop', async () => {
  await expect(importChatImage('owner', generated)).rejects.toThrow('native_input_unverifiable');
  await expect(importChatImage('owner', generated)).rejects.toThrow('image_attempt_stopped');
  await expect(importChatImage('owner', { ...generated, requestId: 'secret-new-attempt' })).rejects.toThrow('image_attempt_stopped');
  expect(state.download).toHaveBeenCalledTimes(1); expect(state.upload).not.toHaveBeenCalled();
  expect(await readImageFailures('owner', id)).toHaveLength(1);
  expect((await preflightSubmissionImage('owner', input)).blockers).toContain('mcp_submission_image_attempt_stopped');
});
it('cannot change an existing failed intent under the same request ID', async () => {
  await expect(importChatImage('owner', generated)).rejects.toThrow('native_input_unverifiable');
  await expect(importChatImage('owner', { ...generated, caption: 'different' })).rejects.toThrow('idempotency_conflict');
  expect(state.download).toHaveBeenCalledTimes(1);
});
it('recovers the preserved original after a lost storage reply with no new download/upload', async () => {
  state.loseSaveReply = true;
  await expect(importChatImage('owner', generated)).rejects.toThrow('native_input_unverifiable');
  expect((await readImageFailures('owner', id))[0].originalPreserved).toBe(false);
  await expect(importChatImage('owner', generated)).rejects.toThrow('image_attempt_stopped');
  expect((await readImageFailures('owner', id))[0].originalPreserved).toBe(true);
  expect(state.download).toHaveBeenCalledTimes(1); expect(state.upload).not.toHaveBeenCalled();
});
it('concurrent repeated failed imports preserve one receipt and download once', async () => {
  await Promise.allSettled([importChatImage('owner', generated), importChatImage('owner', generated)]);
  expect(await readImageFailures('owner', id)).toHaveLength(1);
  expect(state.download).toHaveBeenCalledTimes(1); expect(state.upload).not.toHaveBeenCalled();
});
it('records an expired native URL honestly without inventing original preservation or retrying', async () => {
  state.download.mockRejectedValue(Error('expired'));
  await expect(importChatImage('owner', generated)).rejects.toThrow('native_input_unverifiable');
  expect((await readImageFailures('owner', id))[0]).toMatchObject({ originalPreserved: false, status: 'retention_unconfirmed' });
  await expect(importChatImage('owner', generated)).rejects.toThrow('image_attempt_stopped');
  expect(state.download).toHaveBeenCalledTimes(1);
});
it('cannot relabel a known rejected generated file as a user photo to attach it', async () => {
  await expect(importChatImage('owner', generated)).rejects.toThrow('native_input_unverifiable');
  await expect(importChatImage('owner', { ...generated, kind: 'photo', origin: 'user-upload', briefId: undefined,
    generationReport: undefined, requestId: 'relabel-attempt-0001' })).rejects.toThrow('rejected_image_relabelled');
  expect(state.upload).not.toHaveBeenCalled();
});
it('preserves actual article content and metadata, including a no-revision concurrent edit', async () => {
  const original = structuredClone(memory.rows.get(path).article), hash = imageProtectedContentHash(original);
  for (const key of ['title', 'subtitle', 'intro', 'author', 'category', 'seoTitle', 'seoDescription', 'slug'])
    expect(() => assertImageContentInvariant(original, { ...original, [key]: 'changed' }, hash)).toThrow('image_content_changed');
  expect(() => assertImageContentInvariant(original, { ...original, content: original.content.replace('egne ord', 'nye ord') }, hash)).toThrow('image_content_changed');
  memory.rows.get(path).article.title = 'Concurrent mutation';
  expect((await preflightSubmissionImage('owner', input)).blockers).toContain('mcp_submission_image_content_changed');
  await expect(updateSubmission('owner', { submissionId: id, expectedRevision: 2, requestId: 'internal-image-attach',
    article: { featuredImage: 'https://cdn.test/photo.jpg' } }, { replaceUrls: [], protectedContentHash: hash })).rejects.toThrow('image_content_changed');
});
it('photo-only output attachment is exempt from native integration and preserves all non-media fields', async () => {
  state.upload.mockImplementation(async (_bytes, _name, save) => { const asset = { id: 'real', url: 'https://cdn.prod.website-files.com/test/photo.png' }; await save(asset); return asset; });
  const old = structuredClone(memory.rows.get(path));
  const result = await importChatImage('owner', { ...generated, kind: 'photo', origin: 'user-upload', briefId: undefined, generationReport: undefined });
  expect(result).toMatchObject({ revision: 3, publicationApproval: false, paidAiCalls: 0 });
  expect(imageProtectedContentHash(memory.rows.get(path).article)).toBe(imageProtectedContentHash(old.article));
  expect(memory.rows.get(path).approval).toBeUndefined(); expect(memory.rows.get(path).status).toBe('draft');
  expect(await importChatImage('owner', { ...generated, kind: 'photo', origin: 'user-upload', briefId: undefined, generationReport: undefined })).toMatchObject({ replay: true });
  expect(state.upload).toHaveBeenCalledTimes(1);
});
it('rejects raw illustration links in both creation and ordinary updates, including a mode change', async () => {
  const row = memory.rows.get(path), before = cmsFieldHash([...memory.rows]);
  await expect(prepareSubmission('owner', { requestId: 'raw-illustration-link', choices: row.choices, research: [],
    article: { ...row.article, featuredImage: 'https://cdn.test/unknown.png' } })).rejects.toThrow('image_import_required');
  for (const article of [{ featuredImage: 'https://cdn.test/unknown.png' },
    { content: row.article.content + '<img src="https://cdn.test/unknown.png" alt="Unknown" />' }]) {
    await expect(updateSubmission('owner', { submissionId: id, expectedRevision: 2, requestId: 'raw-link-update-0001',
      article, choices: { media: 'provided' } })).rejects.toThrow('image_import_required');
  }
  expect(cmsFieldHash([...memory.rows])).toBe(before); expect(state.upload).not.toHaveBeenCalled();
});
it('does not block a text correction that preserves existing historical illustration URLs', async () => {
  memory.rows.get(path).article.featuredImage = 'https://cdn.test/historical.png';
  await expect(updateSubmission('owner', { submissionId: id, expectedRevision: 2, requestId: 'text-only-correction',
    article: { title: 'A corrected editorial title' } })).resolves.toMatchObject({ revision: 3 });
  expect(memory.rows.get(path).article.featuredImage).toBe('https://cdn.test/historical.png');
});
it('clients cannot supply a capability override or claim verified hidden inputs', () => {
  expect(() => imagePreflightInput.parse({ ...input, exactPromptExecutionVerified: true })).toThrow();
  expect(() => assertNativeImageIntegration()).toThrow('native_input_unverifiable');
});
it('returns no execution permit after the article changes during reference-byte validation', async () => {
  const original = state.files.get.bind(state.files);
  vi.spyOn(state.files, 'get').mockImplementation(key => {
    if (key === 'private/style') memory.rows.get(path).article.title = 'Changed while reading bytes';
    return original(key);
  });
  expect((await preflightSubmissionImage('owner', input)).blockers).toContain('mcp_submission_image_content_changed');
  vi.restoreAllMocks();
});
it('retains undecodable rejected data privately but never renders HTML as an image', async () => {
  const { file: _file, ...data } = generated;
  const receipt = await retainRejectedImage('owner', data, { identity: 'bad-file', read: async () => Buffer.from('<html>Not an image</html>') }, 'mcp_submission_image_invalid');
  expect(receipt.originalPreserved).toBe(true);
  await expect(previewImageFailure('owner', { submissionId: id, failureId: receipt.failureId })).rejects.toThrow('rejected_image_unavailable');
});
