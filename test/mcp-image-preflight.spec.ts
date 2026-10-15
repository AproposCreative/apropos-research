import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { memoryFirestore } from './helpers/mcp-firestore';
const state = vi.hoisted(() => ({ db: null as any, files: new Map<string, Buffer>(), download: vi.fn(), upload: vi.fn(), loseSaveReply: false,
  account: { email: 'frederik@aproposmagazine.com', emailVerified: true, disabled: false } }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db, getAdminAuth: () => ({ getUser: async () => state.account }), getAdminStorageBucket: () => ({ file: (path: string) => ({
  save: async (bytes: Buffer) => { state.files.set(path, bytes); if (state.loseSaveReply) throw Error('timeout'); },
  download: async () => { if (!state.files.has(path)) throw Error('missing'); return [state.files.get(path)]; },
}) }) }));
vi.mock('@/lib/liv/public-media-reader', () => ({ readChatGptImage: (...args: any[]) => state.download(...args) }));
vi.mock('@/lib/image-gen/cms-asset', async original => ({ ...await original<any>(), uploadImageGenCmsAsset: (...args: any[]) => state.upload(...args) }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => ({ authors: [], categories: [], topics: [] }) }));
import { preflightSubmissionImage, imagePreflightInput } from '@/lib/editorial/image-preflight';
import { assertGenerationContract, IMAGE_HANDOFF_VERSION, promptHash } from '@/lib/editorial/image-generation-evidence';
import { NATIVE_IMAGE_INTEGRATION } from '@/lib/editorial/native-image-integration';
import { importChatImage } from '@/lib/editorial/chat-image-import';
import { declineGeneratedImage, selectGeneratedImage, imageCandidatePreviews } from '@/lib/editorial/generated-image-candidate';
import { getSubmissionStatus } from '@/lib/editorial/submissions';
import { imageProtectedContentHash, assertImageContentInvariant } from '@/lib/editorial/image-content-invariant';
import { readImageFailures, previewImageFailure, retainRejectedImage } from '@/lib/editorial/image-failure';
import { readImageGenSnapshot } from '@/lib/image-gen/snapshot';
import { prepareSubmission, updateSubmission } from '@/lib/editorial/submissions';
import { validateReference } from '@/lib/editorial/image-reference';
import { chatSubmissionPreview, confirmChatSubmission } from '@/lib/editorial/chat-preview';
import { digest } from '@/lib/mcp/oauth';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { authorizeImageAttemptResume, claimImageAttemptResume, claimSubmissionImageAttempt, imageAttemptClaimInput } from '@/lib/editorial/image-attempt-resume';
const id = 'a'.repeat(64), briefId = 'b'.repeat(64), subjectId = 'c'.repeat(64), path = `editorialSubmissions/${id}`;
let memory: ReturnType<typeof memoryFirestore>, input: any, brief: any, generated: any, bytes: Buffer;
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubEnv('FIREBASE_STORAGE_BUCKET', 'test-only'); state.files.clear(); state.loseSaveReply = false;
  state.account = { email: 'frederik@aproposmagazine.com', emailVerified: true, disabled: false };
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

it('a complete read-only preflight permits one reviewed attempt without claiming hidden native proof', async () => {
  const before = cmsFieldHash([...memory.rows]); const result = await preflightSubmissionImage('owner', input);
  expect(result).toMatchObject({ inputsComplete: true, canGenerate: true, canImportGeneratedImage: false, paidAiCalls: 0,
    publicationApproval: false, integration: { exactPromptExecutionVerified: false, inputObservation: 'unavailable' } });
  expect(result.blockers).toEqual([]);
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
it('rejects visually wrong output; preserves the rejected original and receipt, never CMS', async () => {
  generated.generationReport.outputCheck.imageType = 'collage';
  const articleBefore = cmsFieldHash(memory.rows.get(path));
  await expect(importChatImage('owner', generated)).rejects.toThrow('generated_image_type_invalid');
  const failures = await readImageFailures('owner', id);
  expect(failures).toHaveLength(1); expect(failures[0]).toMatchObject({ originalPreserved: true, originalHash: generated.generationReport.outputCheck.sha256,
    code: 'mcp_submission_generated_image_type_invalid', automaticRetryAllowed: false });
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
  generated.generationReport.outputCheck.imageType = 'collage';
  await expect(importChatImage('owner', generated)).rejects.toThrow('generated_image_type_invalid');
  await expect(importChatImage('owner', generated)).rejects.toThrow('image_attempt_stopped');
  await expect(importChatImage('owner', { ...generated, requestId: 'secret-new-attempt' })).rejects.toThrow('image_attempt_stopped');
  expect(state.download).toHaveBeenCalledTimes(1); expect(state.upload).not.toHaveBeenCalled();
  expect(await readImageFailures('owner', id)).toHaveLength(1);
  expect((await preflightSubmissionImage('owner', input)).blockers).toContain('mcp_submission_image_attempt_stopped');
});
it('cannot change an existing failed intent under the same request ID', async () => {
  generated.generationReport.outputCheck.imageType = 'collage';
  await expect(importChatImage('owner', generated)).rejects.toThrow('generated_image_type_invalid');
  await expect(importChatImage('owner', { ...generated, caption: 'different' })).rejects.toThrow('idempotency_conflict');
  expect(state.download).toHaveBeenCalledTimes(1);
});
it('recovers the preserved original after a lost storage reply with no new download/upload', async () => {
  generated.generationReport.outputCheck.imageType = 'collage';
  state.loseSaveReply = true;
  await expect(importChatImage('owner', generated)).rejects.toThrow('generated_image_type_invalid');
  expect((await readImageFailures('owner', id))[0].originalPreserved).toBe(false);
  await expect(importChatImage('owner', generated)).rejects.toThrow('image_attempt_stopped');
  expect((await readImageFailures('owner', id))[0].originalPreserved).toBe(true);
  expect(state.download).toHaveBeenCalledTimes(1); expect(state.upload).not.toHaveBeenCalled();
});
it('concurrent repeated failed imports preserve one receipt and download once', async () => {
  generated.generationReport.outputCheck.imageType = 'collage';
  await Promise.allSettled([importChatImage('owner', generated), importChatImage('owner', generated)]);
  expect(await readImageFailures('owner', id)).toHaveLength(1);
  expect(state.download).toHaveBeenCalledTimes(1); expect(state.upload).not.toHaveBeenCalled();
});
it('records an expired native URL honestly without inventing original preservation or retrying', async () => {
  generated.generationReport.outputCheck.imageType = 'collage';
  state.download.mockRejectedValue(Error('expired'));
  await expect(importChatImage('owner', generated)).rejects.toThrow('generated_image_type_invalid');
  expect((await readImageFailures('owner', id))[0]).toMatchObject({ originalPreserved: false, status: 'retention_unconfirmed' });
  await expect(importChatImage('owner', generated)).rejects.toThrow('image_attempt_stopped');
  expect(state.download).toHaveBeenCalledTimes(1);
});
it('cannot relabel a known rejected generated file as a user photo to attach it', async () => {
  generated.generationReport.outputCheck.imageType = 'collage';
  await expect(importChatImage('owner', generated)).rejects.toThrow('generated_image_type_invalid');
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
  expect(NATIVE_IMAGE_INTEGRATION.exactPromptExecutionVerified).toBe(false);
  expect(Object.isFrozen(NATIVE_IMAGE_INTEGRATION)).toBe(true);
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

it('stages a valid illustration privately, replays it without download, and blocks another attempt until the user chooses', async () => {
  const before = cmsFieldHash(memory.rows.get(path));
  const staged = await importChatImage('owner', generated);
  expect(staged).toMatchObject({ importStatus: 'awaiting_personal_selection', revision: 2, originalPreserved: true, publicationApproval: false });
  expect(cmsFieldHash(memory.rows.get(path))).toBe(before); expect(state.upload).not.toHaveBeenCalled();
  await importChatImage('owner', generated); expect(state.download).toHaveBeenCalledTimes(1);
  const status = await getSubmissionStatus('owner', id);
  expect(status.readyForPreparation).toBe(false);
  expect(status.handoff.nextAction).toBe('show_inline_preview_for_personal_image_selection');
  expect(status.imageCandidates).toHaveLength(1);
  expect((await imageCandidatePreviews('owner', id, status.imageCandidates))[staged.assetId]).toMatch(/^data:image\/webp;base64,/);
  expect((await preflightSubmissionImage('owner', input)).blockers).toContain('mcp_submission_image_selection_required');
  await expect(importChatImage('owner', { ...generated, requestId: 'second-attempt-0001' })).rejects.toThrow('image_selection_required');
  await expect(importChatImage('owner', { ...generated, requestId: 'fake-photo-attempt-0001', kind: 'photo', origin: 'user-upload',
    briefId: undefined, generationReport: undefined })).rejects.toThrow('generated_image_relabelled');
  expect(state.upload).not.toHaveBeenCalled(); expect(JSON.stringify([...memory.rows])).not.toContain('PRIVATE');
});
it('rejects model-supplied personal approval and wrong owner, file, revision or concurrently changed prose', async () => {
  await expect(importChatImage('owner', { ...generated, personalSelection: { uid: 'owner' } })).rejects.toThrow();
  const staged = await importChatImage('owner', generated), sha = generated.generationReport.outputCheck.sha256;
  await expect(selectGeneratedImage('other', id, 2, staged.assetId, sha)).rejects.toThrow('not_found');
  await expect(selectGeneratedImage('owner', id, 1, staged.assetId, sha)).rejects.toThrow('preview_changed');
  await expect(selectGeneratedImage('owner', id, 2, staged.assetId, 'f'.repeat(64))).rejects.toThrow('preview_changed');
  memory.rows.get(path).article.title = 'Concurrent editorial change';
  await expect(selectGeneratedImage('owner', id, 2, staged.assetId, sha)).rejects.toThrow('preview_changed');
  expect(state.upload).not.toHaveBeenCalled();
});
it('recovers a lost private save reply from identical retained bytes without another generation or CMS upload', async () => {
  state.loseSaveReply = true;
  const first = await importChatImage('owner', generated);
  await importChatImage('owner', generated);
  expect(first).toMatchObject({ originalPreserved: true, importStatus: 'awaiting_personal_selection' });
  expect(state.download).toHaveBeenCalledTimes(1); expect(state.upload).not.toHaveBeenCalled();
});
it('a UI-only exact-file choice attaches once, preserves prose and does not require a second image selection or publish', async () => {
  const old = structuredClone(memory.rows.get(path));
  state.upload.mockImplementation(async (_bytes, _name, save) => { const asset = { id: 'real', url: 'https://cdn.prod.website-files.com/test/real.png' }; await save(asset); return asset; });
  const staged = await importChatImage('owner', generated);
  const identity = { uid: 'owner', owner: true, role: 'owner', scopes: ['apropos:read', 'apropos:draft'], grantId: 'grant' };
  const preview = await chatSubmissionPreview(identity, id);
  expect(preview.confirmation?.action).toBe('image_candidate');
  expect(preview.candidatePreviews[staged.assetId]).toMatch(/^data:image\/webp;base64,/);
  expect(JSON.stringify(preview.data)).not.toContain(preview.confirmation!.token);
  await expect(confirmChatSubmission({ ...identity, uid: 'other' }, { token: preview.confirmation!.token })).rejects.toThrow('confirmation_required');
  await expect(confirmChatSubmission({ ...identity, scopes: ['apropos:read'] }, { token: preview.confirmation!.token })).rejects.toThrow('confirmation_required');
  await expect(confirmChatSubmission(identity, { token: preview.confirmation!.token })).rejects.toThrow('image_preview_required');
  await expect(confirmChatSubmission(identity, { token: preview.confirmation!.token, displayedImageHash: 'f'.repeat(64) })).rejects.toThrow('image_preview_required');
  const displayedImageHash = generated.generationReport.outputCheck.sha256;
  const result = await confirmChatSubmission(identity, { token: preview.confirmation!.token, displayedImageHash });
  expect(result).toMatchObject({ revision: 3, queuedOnServer: false, publicationApproval: false });
  // Simulate a lost reply after committed attachment but before token receipt.
  const token = memory.rows.get('mcpUiConfirmations/' + digest(preview.confirmation!.token));
  token.status = 'attempted'; delete token.result;
  expect(await confirmChatSubmission(identity, { token: preview.confirmation!.token, displayedImageHash })).toMatchObject({ revision: 3, replay: true });
  expect(state.upload).toHaveBeenCalledTimes(1); expect(state.download).toHaveBeenCalledTimes(1);
  const status = await getSubmissionStatus('owner', id);
  expect(status.imageCandidates).toHaveLength(0); expect(status.imageSelection.required).toBe(false);
  expect(imageProtectedContentHash(memory.rows.get(path).article)).toBe(imageProtectedContentHash(old.article));
  expect(memory.rows.get(path).approval).toBeUndefined(); expect(memory.rows.get(path).status).toBe('draft');
});
it('records context delivery honestly without upgrading it into hidden-argument verification', async () => {
  generated.generationReport.inputMode = 'conversation_context';
  const staged = await importChatImage('owner', generated);
  expect(staged.generationEvidence).toMatchObject({ inputMode: 'conversation_context', exactPromptExecutionVerified: false });
});

function resumeInput() {
  const { subjectReferenceIds: _refs, subjectReferencesRequired: _required, ...placement } = input;
  return { ...placement, requestId: 'explicit-owner-resume-0001', inputMode: 'explicit_arguments',
    decision: 'Owner approved exactly one new cover trial in the current chat.',
    resolution: 'Native tool exposes exact prompt and two actual local reference file arguments.' };
}
async function rejectedAttempt() {
  await expect(importChatImage('owner', { ...generated, generationReport: { ...generated.generationReport,
    outputCheck: { ...generated.generationReport.outputCheck, styleMatch: 'mismatch' } } })).rejects.toThrow('generated_image_type_invalid');
  // A genuinely different new output, never relabel the rejected bytes.
  bytes = await sharp({ create: { width: 1200, height: 800, channels: 3, background: 'yellow' } }).png().toBuffer();
  state.download.mockResolvedValue(bytes);
  generated.generationReport.outputCheck.sha256 = (await validateReference(bytes)).sha256;
}
it('explicit operator-recorded decision allows one dispatch, private staging and idempotent recovery, never personal selection', async () => {
  await rejectedAttempt();
  const failureBefore = cmsFieldHash(await readImageFailures('owner', id)), articleBefore = cmsFieldHash(memory.rows.get(path));
  const grant = await authorizeImageAttemptResume('owner', resumeInput());
  expect(grant).toMatchObject({ canDispatch: true, publicationApproval: false });
  expect(await authorizeImageAttemptResume('owner', resumeInput())).toEqual(grant);
  expect((await preflightSubmissionImage('owner', input)).canGenerate).toBe(true);
  await expect(importChatImage('owner', { ...generated, requestId: resumeInput().requestId })).rejects.toThrow('image_attempt_stopped');
  const claim = await claimImageAttemptResume('owner', resumeInput());
  expect(claim.dispatchAllowed).toBe(true);
  expect((await claimImageAttemptResume('owner', resumeInput())).dispatchAllowed).toBe(false);
  expect((await preflightSubmissionImage('owner', input)).canGenerate).toBe(false);
  await expect(importChatImage('owner', { ...generated, requestId: 'unapproved-second-attempt' })).rejects.toThrow('image_attempt_stopped');
  const result = await importChatImage('owner', { ...generated, requestId: resumeInput().requestId });
  expect(result).toMatchObject({ importStatus: 'awaiting_personal_selection', publicationApproval: false, originalPreserved: true });
  expect(await importChatImage('owner', { ...generated, requestId: resumeInput().requestId })).toMatchObject({ assetId: result.assetId });
  expect(state.download).toHaveBeenCalledTimes(2); expect(state.upload).not.toHaveBeenCalled();
  expect(cmsFieldHash(await readImageFailures('owner', id))).toBe(failureBefore);
  expect(cmsFieldHash(memory.rows.get(path))).toBe(articleBefore);
});
it('parallel claims consume the single dispatch once', async () => {
  await rejectedAttempt(); await authorizeImageAttemptResume('owner', resumeInput());
  const claims = await Promise.all([claimImageAttemptResume('owner', resumeInput()), claimImageAttemptResume('owner', resumeInput())]);
  expect(claims.filter(c => c.dispatchAllowed)).toHaveLength(1);
});
it.each(['disabled', 'unverified', 'other-owner'])('rejects unauthorized service actor %s', async mode => {
  await rejectedAttempt();
  if (mode === 'disabled') state.account.disabled = true;
  if (mode === 'unverified') state.account.emailVerified = false;
  if (mode === 'other-owner') state.account.email = 'another@example.com';
  await expect(authorizeImageAttemptResume('owner', resumeInput())).rejects.toThrow('owner_required');
});
it('requires preserved failure evidence, real references and a fresh version', async () => {
  await expect(authorizeImageAttemptResume('owner', resumeInput())).rejects.toThrow('retry_evidence_missing');
  await rejectedAttempt();
  await expect(authorizeImageAttemptResume('owner', { ...resumeInput(), expectedRevision: 1 })).rejects.toThrow('revision_conflict');
  state.files.delete('private/style');
  await expect(authorizeImageAttemptResume('owner', resumeInput())).rejects.toThrow('style_reference_required');
});
it('cannot refresh an exhausted grant by changing the request ID or overwrite the failed request', async () => {
  await rejectedAttempt(); await authorizeImageAttemptResume('owner', resumeInput());
  await expect(authorizeImageAttemptResume('owner', { ...resumeInput(), requestId: generated.requestId })).rejects.toThrow('idempotency_conflict');
  await expect(authorizeImageAttemptResume('owner', { ...resumeInput(), requestId: 'silent-new-attempt-0002' })).rejects.toThrow('idempotency_conflict');
});
it.each(['revision', 'text', 'brief', 'expiry'])('invalidates a stale resume binding: %s', async mode => {
  await rejectedAttempt(); await authorizeImageAttemptResume('owner', resumeInput());
  if (mode === 'revision') memory.rows.get(path).revision++;
  if (mode === 'text') memory.rows.get(path).article.title = 'changed without revision';
  if (mode === 'brief') { brief.prompt += ' changed'; brief.canonicalPromptHash = promptHash(brief.prompt); }
  if (mode === 'expiry') for (const [key, value] of memory.rows) if (key.includes('/imageAttemptResumes/')) value.expiresAt = '2000-01-01T00:00:00.000Z';
  expect((await preflightSubmissionImage('owner', input)).canGenerate).toBe(false);
  await expect(claimImageAttemptResume('owner', resumeInput())).rejects.toThrow('image_attempt_stopped');
});
it('a new rejected output closes the old grant, retaining BOTH originals and refusing hidden retry', async () => {
  await rejectedAttempt(); await authorizeImageAttemptResume('owner', resumeInput()); await claimImageAttemptResume('owner', resumeInput());
  await expect(importChatImage('owner', { ...generated, requestId: resumeInput().requestId,
    generationReport: { ...generated.generationReport, outputCheck: { ...generated.generationReport.outputCheck, textVisible: true } } })).rejects.toThrow('generated_image_type_invalid');
  expect(await readImageFailures('owner', id)).toHaveLength(2);
  expect((await preflightSubmissionImage('owner', input)).canGenerate).toBe(false);
  await expect(importChatImage('owner', { ...generated, requestId: 'third-auto-attempt' })).rejects.toThrow('image_attempt_stopped');
  expect(state.upload).not.toHaveBeenCalled();
});

it('personal decline preserves original, article, version and audit; repeated/lost replies do not create another action', async () => {
  const staged = await importChatImage('owner', generated), sha = generated.generationReport.outputCheck.sha256;
  const before = cmsFieldHash(memory.rows.get(path)), files = cmsFieldHash([...state.files].map(([k, v]) => [k, v.toString('base64')]));
  const identity = { uid: 'owner', owner: true, role: 'owner', scopes: ['apropos:read', 'apropos:draft'], grantId: 'grant' };
  const preview = await chatSubmissionPreview(identity, id);
  expect(preview.confirmation?.canDecline).toBe(true);
  const choice = { token: preview.confirmation!.token, displayedImageHash: sha, imageDecision: 'decline' };
  expect(await confirmChatSubmission(identity, choice)).toMatchObject({ imageDeclined: true, revision: 2, canGenerate: false, queuedOnServer: false });
  const token = memory.rows.get('mcpUiConfirmations/' + digest(choice.token)); token.status = 'attempted'; delete token.result;
  expect(await confirmChatSubmission(identity, choice)).toMatchObject({ imageDeclined: true, replay: true });
  await expect(confirmChatSubmission(identity, { ...choice, imageDecision: 'select' })).rejects.toThrow('preview_changed');
  await expect(selectGeneratedImage('owner', id, 2, staged.assetId, sha)).rejects.toThrow('image_candidate_declined');
  await expect(importChatImage('owner', generated)).rejects.toThrow('image_candidate_declined');
  const status = await getSubmissionStatus('owner', id);
  expect(status.imageCandidates).toEqual([]); expect(status.imageSelection.required).toBe(false);
  expect(status.imageDeclines).toMatchObject([{ assetId: staged.assetId, originalPreserved: true, automaticRetryAllowed: false }]);
  expect((await preflightSubmissionImage('owner', input)).blockers).toEqual(['mcp_submission_image_attempt_stopped']);
  expect(cmsFieldHash(memory.rows.get(path))).toBe(before);
  expect(cmsFieldHash([...state.files].map(([k, v]) => [k, v.toString('base64')]))).toBe(files);
  expect([...memory.rows.keys()].filter(k => k.includes('/declines/'))).toHaveLength(1);
  expect(state.upload).not.toHaveBeenCalled(); expect(state.download).toHaveBeenCalledTimes(1);
});
it.each(['missing-pixels', 'wrong-pixels', 'scope', 'grant', 'expiry', 'legacy-token'])('personal decline rejects invalid UI authority: %s', async mode => {
  const staged = await importChatImage('owner', generated);
  const identity = { uid: 'owner', owner: true, role: 'owner', scopes: ['apropos:read', 'apropos:draft'], grantId: 'grant' };
  const preview = await chatSubmissionPreview(identity, id), token = preview.confirmation!.token;
  const record = memory.rows.get('mcpUiConfirmations/' + digest(token));
  if (mode === 'expiry') record.expiresAt = 0;
  if (mode === 'legacy-token') delete record.canDecline;
  if (mode === 'scope') identity.scopes = ['apropos:read'];
  if (mode === 'grant') identity.grantId = 'other';
  const displayedImageHash = mode === 'missing-pixels' ? undefined : mode === 'wrong-pixels' ? 'f'.repeat(64) : generated.generationReport.outputCheck.sha256;
  await expect(confirmChatSubmission(identity, { token, displayedImageHash, imageDecision: 'decline' })).rejects.toThrow();
  expect(memory.rows.get(`${path}/chatAssets/${staged.assetId}`).status).toBe('awaiting_personal_selection');
  expect(state.upload).not.toHaveBeenCalled();
});
it.each(['owner', 'revision', 'hash', 'prose'])('decline rejects changed %s and retains the pending candidate', async mode => {
  const staged = await importChatImage('owner', generated), sha = generated.generationReport.outputCheck.sha256;
  if (mode === 'prose') memory.rows.get(path).article.title += ' changed';
  await expect(declineGeneratedImage(mode === 'owner' ? 'other' : 'owner', id, mode === 'revision' ? 1 : 2,
    staged.assetId, mode === 'hash' ? 'f'.repeat(64) : sha)).rejects.toThrow();
  expect(memory.rows.get(`${path}/chatAssets/${staged.assetId}`).status).toBe('awaiting_personal_selection');
  expect(state.upload).not.toHaveBeenCalled();
});
it('a bare declined flag without exact personal receipt cannot release pending-selection guards', async () => {
  const staged = await importChatImage('owner', generated);
  memory.rows.get(`${path}/chatAssets/${staged.assetId}`).status = 'declined';
  expect((await getSubmissionStatus('owner', id)).imageCandidates).toHaveLength(1);
  expect((await preflightSubmissionImage('owner', input)).blockers).toContain('mcp_submission_image_selection_required');
});
it('decline wins atomically over a concurrent stale select and never uploads', async () => {
  const staged = await importChatImage('owner', generated), sha = generated.generationReport.outputCheck.sha256;
  const outcomes = await Promise.allSettled([declineGeneratedImage('owner', id, 2, staged.assetId, sha), selectGeneratedImage('owner', id, 2, staged.assetId, sha)]);
  expect(outcomes.map(r => r.status)).toEqual(['fulfilled', 'rejected']); expect(state.upload).not.toHaveBeenCalled();
});
it('cannot decline an already personally selected file, including interrupted CMS attachment', async () => {
  const staged = await importChatImage('owner', generated), sha = generated.generationReport.outputCheck.sha256;
  Object.assign(memory.rows.get(`${path}/chatAssets/${staged.assetId}`), { personalSelection: { uid: 'owner', originalHash: sha }, status: 'stored' });
  await expect(declineGeneratedImage('owner', id, 2, staged.assetId, sha)).rejects.toThrow('operation_pending');
});
it('new direction gets one new immutable authorization after decline, not by overwriting the consumed grant', async () => {
  await rejectedAttempt(); const first = resumeInput();
  const grant = await authorizeImageAttemptResume('owner', first); await claimImageAttemptResume('owner', first);
  const staged = await importChatImage('owner', { ...generated, requestId: first.requestId });
  const oldGrant = cmsFieldHash(memory.rows.get(`${path}/imageAttemptResumes/${grant!.grantId}`));
  const failures = cmsFieldHash(await readImageFailures('owner', id)), row = cmsFieldHash(memory.rows.get(path));
  const nextBriefId = 'e'.repeat(64), nextBrief = { ...brief, briefId: nextBriefId, prompt: 'Exact baby cafe meets nightclub direction.',
    canonicalPromptHash: promptHash('Exact baby cafe meets nightclub direction.'), retainedReferences: [brief.retainedReferences[0]],
    requiredReferenceHashes: [brief.referenceHash], subjectReferencesRequired: false, subjectReferenceIds: [] };
  memory.rows.set(`${path}/chatBriefs/${nextBriefId}`, nextBrief);
  const next = { ...first, requestId: 'explicit-new-direction-0002', briefId: nextBriefId,
    decision: 'Owner explicitly approved one new baby cafe and nightclub direction, without portrait.' };
  await expect(authorizeImageAttemptResume('owner', next)).rejects.toThrow('image_selection_required');
  await declineGeneratedImage('owner', id, 2, staged.assetId, generated.generationReport.outputCheck.sha256);
  const check = { ...input, briefId: nextBriefId, subjectReferencesRequired: false, subjectReferenceIds: [] };
  expect((await preflightSubmissionImage('owner', check)).canGenerate).toBe(false);
  const second = await authorizeImageAttemptResume('owner', next); expect(second!.grantId).not.toBe(grant!.grantId);
  expect((await preflightSubmissionImage('owner', check)).canGenerate).toBe(true);
  const claims = await Promise.all([claimImageAttemptResume('owner', next), claimImageAttemptResume('owner', next)]);
  expect(claims.filter(c => c.dispatchAllowed)).toHaveLength(1);
  await expect(authorizeImageAttemptResume('owner', { ...next, requestId: 'silent-third-attempt-0003' })).rejects.toThrow('idempotency_conflict');
  expect(cmsFieldHash(memory.rows.get(`${path}/imageAttemptResumes/${grant!.grantId}`))).toBe(oldGrant);
  expect(cmsFieldHash(await readImageFailures('owner', id))).toBe(failures);
  expect(cmsFieldHash(memory.rows.get(path))).toBe(row); expect(state.upload).not.toHaveBeenCalled();
});
it('a personal decline without earlier technical failure still needs explicit retry authority', async () => {
  const staged = await importChatImage('owner', generated);
  await declineGeneratedImage('owner', id, 2, staged.assetId, generated.generationReport.outputCheck.sha256);
  await expect(importChatImage('owner', { ...generated, requestId: 'silent-retry-after-decline' })).rejects.toThrow('image_attempt_stopped');
  expect(await authorizeImageAttemptResume('owner', resumeInput())).toMatchObject({ canDispatch: true });
  expect((await claimImageAttemptResume('owner', resumeInput())).dispatchAllowed).toBe(true);
  await expect(importChatImage('owner', { ...generated, requestId: resumeInput().requestId })).rejects.toThrow('image_candidate_declined');
  expect(state.upload).not.toHaveBeenCalled(); expect(state.download).toHaveBeenCalledTimes(2);
});
it('retains compatibility with legacy v32 grant identities when no decline exists', async () => {
  await rejectedAttempt(); const grant = await authorizeImageAttemptResume('owner', resumeInput());
  const ids = (await readImageFailures('owner', id)).map(f => f.failureId).sort();
  expect(grant!.grantId).toBe(cmsFieldHash({ uid: 'owner', submissionId: id, failureIds: ids }));
  expect(memory.rows.get(`${path}/imageAttemptResumes/${grant!.grantId}`).declinedImages).toBeUndefined();
});

async function registeredClaim() {
  await rejectedAttempt();
  const grant = await authorizeImageAttemptResume('owner', resumeInput());
  const { decision: _decision, resolution: _resolution, ...placement } = resumeInput();
  return { ...placement, grantId: grant!.grantId };
}
it('exposes the missing preflight → claim → same-request import handoff without granting authority', async () => {
  const claimInput = await registeredClaim(), before = cmsFieldHash(memory.rows.get(path));
  const preflight = await preflightSubmissionImage('owner', input);
  expect(preflight.dispatch).toMatchObject({ claimRequired: true, tool: 'claim_submission_image_attempt',
    grantId: claimInput.grantId, requestId: claimInput.requestId });
  expect(preflight.instruction).toContain('FØR dette nye forsøg');
  const claim = await claimSubmissionImageAttempt('owner', claimInput);
  expect(claim).toMatchObject({ dispatchAllowed: true, generationStarted: false, paidAiCalls: 0,
    publicationApproval: false, exactPromptExecutionVerified: false, briefId });
  expect((await claimSubmissionImageAttempt('owner', claimInput)).dispatchAllowed).toBe(false);
  const consumed = await preflightSubmissionImage('owner', input);
  expect(consumed.blockers).toContain('mcp_submission_image_dispatch_already_claimed');
  expect(consumed.dispatch?.claimRequired).toBe(false);
  const imported = await importChatImage('owner', { ...generated, requestId: claimInput.requestId });
  expect(imported.importStatus).toBe('awaiting_personal_selection');
  expect((await importChatImage('owner', { ...generated, requestId: claimInput.requestId })).assetId).toBe(imported.assetId);
  expect([...memory.rows.keys()].filter(k => k.includes('/imageAttemptResumes/'))).toHaveLength(1);
  expect(cmsFieldHash(memory.rows.get(path))).toBe(before); expect(state.upload).not.toHaveBeenCalled();
});
it('model-facing claim never creates a missing owner decision', async () => {
  const { decision: _decision, resolution: _resolution, ...placement } = resumeInput();
  const before = cmsFieldHash([...memory.rows]);
  await expect(claimSubmissionImageAttempt('owner', { ...placement, grantId: 'f'.repeat(64) })).rejects.toThrow('image_attempt_stopped');
  expect(cmsFieldHash([...memory.rows])).toBe(before);
});
it.each(['owner', 'grant', 'request', 'brief', 'section', 'revision', 'mode', 'expiry', 'text', 'missing-reference', 'pending-selection', 'status'])('new claim fails closed for %s', async mode => {
  const claim = await registeredClaim();
  if (mode === 'grant') claim.grantId = 'f'.repeat(64);
  if (mode === 'request') claim.requestId = 'different-request-id';
  if (mode === 'brief') claim.briefId = 'f'.repeat(64);
  if (mode === 'section') claim.sectionId = 'f'.repeat(64);
  if (mode === 'revision') claim.expectedRevision = 1;
  if (mode === 'mode') claim.inputMode = 'conversation_context';
  if (mode === 'expiry') memory.rows.get(`${path}/imageAttemptResumes/${claim.grantId}`).expiresAt = '2000-01-01T00:00:00Z';
  if (mode === 'text') memory.rows.get(path).article.title = 'Concurrent mutation';
  if (mode === 'missing-reference') state.files.delete('private/style');
  if (mode === 'pending-selection') memory.rows.set(`${path}/chatAssets/pending`, { status: 'awaiting_personal_selection', importInput: generated });
  if (mode === 'status') memory.rows.get(path).status = 'prepared';
  const before = cmsFieldHash([...memory.rows]);
  await expect(claimSubmissionImageAttempt(mode === 'owner' ? 'other' : 'owner', claim)).rejects.toThrow();
  expect(cmsFieldHash([...memory.rows])).toBe(before); expect(state.upload).not.toHaveBeenCalled();
});
it('a model cannot submit decision text, fabricated proof or change authorization through claim schema', () => {
  const { decision: _decision, resolution: _resolution, ...placement } = resumeInput();
  for (const extra of [{ decision: 'I authorize myself' }, { resolution: 'Everything resolved' }, { uid: 'owner' }, { exactPromptExecutionVerified: true }])
    expect(() => imageAttemptClaimInput.parse({ ...placement, grantId: 'f'.repeat(64), ...extra })).toThrow();
});
it('parallel model claims and a lost first response cannot authorize a second native dispatch', async () => {
  const input = await registeredClaim();
  const responses = await Promise.all([claimSubmissionImageAttempt('owner', input), claimSubmissionImageAttempt('owner', input)]);
  expect(responses.filter(r => r.dispatchAllowed)).toHaveLength(1);
  const recovered = await claimSubmissionImageAttempt('owner', input);
  expect(recovered.dispatchAllowed).toBe(false); expect(recovered.instruction).toContain('tabt svar');
  expect(state.upload).not.toHaveBeenCalled();
});
