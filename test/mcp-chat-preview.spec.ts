import { beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { memoryFirestore } from './helpers/mcp-firestore';
const state = vi.hoisted(() => ({ db: null as any, accept: vi.fn(), approve: vi.fn(), quote: vi.fn(), publication: vi.fn(), readImage: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
vi.mock('@/lib/liv/stored-image-reader', () => ({ readLivStoredImage: state.readImage }));
vi.mock('@/lib/mcp/oauth', async importOriginal => ({ ...await importOriginal<any>(), activeMember: async () => ({ owner: true }) }));
vi.mock('@/lib/mcp/publication', () => ({ assertPublicationEnabled: vi.fn() }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => ({
  authors: [{ id: 'author', name: 'Milo' }], categories: [{ id: 'category', name: 'Kultur' }], topics: [], requiredFields: [], checkedAt: '' }) }));
vi.mock('@/lib/editorial/submission-approval', () => ({ quoteSubmission: state.quote, acceptSubmissionQuote: state.accept }));
vi.mock('@/lib/editorial/submission-publication', async importOriginal => ({ ...await importOriginal<any>(), submissionPublicationPreview: state.publication, approveSubmissionPublication: state.approve, readSubmissionPublication: async () => ({ publicationVerified: false }) }));
import { chatSubmissionPreview, confirmChatSubmission, submissionCosts } from '@/lib/editorial/chat-preview';
import { digest, type McpIdentity } from '@/lib/mcp/oauth';
import { imageGenerationEvidence } from '@/lib/editorial/image-generation-evidence';
const id = 'a'.repeat(64), path = `editorialSubmissions/${id}`;
const identity: McpIdentity = { uid: 'milo', owner: false, role: 'editor', scopes: ['apropos:read', 'apropos:draft', 'apropos:publish'], grantId: 'personal-grant' };
let memory: ReturnType<typeof memoryFirestore>;
beforeEach(() => {
  vi.clearAllMocks(); memory = memoryFirestore(); state.db = memory.db;
  const article = { title: 'En koncert', content: '<p>Vores egen tekst.</p>', intro: 'En indledning', subtitle: 'En vurdering',
    category: 'category', author: 'author', subjectType: 'music', slug: 'en-koncert', seoTitle: 'En koncert', seoDescription: 'En vurdering' };
  memory.rows.set(path, { id, uid: 'milo', status: 'draft', revision: 1, contentHash: 'b'.repeat(64),
    article, originalArticle: article, choices: { kind: 'feature', media: 'provided' }, research: [] });
  state.quote.mockResolvedValue({ revision: 1, contentHash: 'b'.repeat(64), canAccept: true, provider: { blocked: false }, quoteId: 'q', estimateDkk: 2, ceilingDkkMicros: 5_000_000 });
  state.accept.mockResolvedValue({ accepted: true }); state.approve.mockResolvedValue({ status: 'scheduled' });
  state.readImage.mockReset();
});
it('returns full article, named CMS choices and a UI-only confirmation separate from model data', async () => {
  const startedAt = Date.now();
  const preview = await chatSubmissionPreview(identity, id);
  expect(Date.parse(preview.data.previewReadAt)).toBeGreaterThanOrEqual(startedAt);
  expect(Date.parse(preview.data.previewReadAt)).toBeLessThanOrEqual(Date.now());
  expect(preview.data.article.author).toBe('Milo'); expect(preview.data.blocks[0].text).toBe('Vores egen tekst.');
  expect(preview.confirmation?.action).toBe('checks');
  expect(JSON.stringify(preview.data)).not.toContain(preview.confirmation!.token);
  expect(memory.rows.get(`mcpUiConfirmations/${digest(preview.confirmation!.token)}`).grantId).toBe(identity.grantId);
  expect(state.accept).not.toHaveBeenCalled();
});
it('shows a compressed body asset through the restricted stored-image reader without reimporting it', async () => {
  const url = 'https://firebasestorage.googleapis.com/v0/b/own-bucket/o/webflow%2Fcontent-images%2Fcompressed.webp?alt=media&token=fixture';
  const row = memory.rows.get(path);
  row.article.content += `<figure><img src="${url.replaceAll('&', '&amp;')}" alt="Kage"><figcaption>Illustration</figcaption></figure>`;
  state.readImage.mockResolvedValue(await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).webp().toBuffer());
  const preview = await chatSubmissionPreview(identity, id);
  expect(state.readImage).toHaveBeenCalledExactlyOnceWith(url);
  expect(preview.imagePreviews[url]).toMatch(/^data:image\/webp;base64,/);
  expect(preview.data.previewProblems).toEqual([]);
  expect(row.article.content).toContain('compressed.webp');
  expect(state.accept).not.toHaveBeenCalled(); expect(state.approve).not.toHaveBeenCalled();
});
it('does not bypass a rejected image read or offer publication on an incomplete preview', async () => {
  const url = 'https://untrusted.example/image.webp';
  memory.rows.get(path).article.content += `<figure><img src="${url}" alt="Kage"></figure>`;
  state.readImage.mockRejectedValue(Error('liv_stored_image_mismatch'));
  const preview = await chatSubmissionPreview(identity, id);
  expect(state.readImage).toHaveBeenCalledExactlyOnceWith(url);
  expect(preview.imagePreviews).toEqual({});
  expect(preview.data.previewProblems).toHaveLength(1);
  expect(preview.confirmation).toBeNull();
  expect(state.accept).not.toHaveBeenCalled(); expect(state.approve).not.toHaveBeenCalled();
});
function uncertainImage() {
  const url = 'https://cdn.prod.website-files.com/test/retained.png';
  memory.rows.get(path).article.featuredImage = url;
  memory.rows.set(`${path}/chatAssets/${'c'.repeat(64)}`, { uid: identity.uid, assetId: 'c'.repeat(64), status: 'attached', url, role: 'cover', originalHash: 'd'.repeat(64),
    generationEvidence: imageGenerationEvidence({ kind: 'illustration', origin: 'chatgpt-generated' }, { prompt: 'Flat colours', referenceHash: 'e'.repeat(64) }) });
}
it('requires a separate version-bound personal image selection, even under provider hold, without dispatching paid work or publishing', async () => {
  uncertainImage(); state.quote.mockResolvedValue({ revision: 1, contentHash: 'b'.repeat(64), canAccept: false, provider: { blocked: true } });
  const preview = await chatSubmissionPreview(identity, id);
  expect(preview.confirmation?.action).toBe('media'); expect(preview.data.imageSelection.required).toBe(true);
  const result = await confirmChatSubmission(identity, { token: preview.confirmation!.token });
  expect(result).toMatchObject({ mediaSelected: true, queuedOnServer: false, publicationApproval: false });
  expect((await chatSubmissionPreview(identity, id)).data.imageSelection).toMatchObject({ required: false, accepted: true, exactPromptExecutionVerified: false });
  expect(state.accept).not.toHaveBeenCalled(); expect(state.approve).not.toHaveBeenCalled();
  expect(await confirmChatSubmission(identity, { token: preview.confirmation!.token })).toEqual(result);
  memory.rows.get(path).revision++;
  expect((await chatSubmissionPreview(identity, id)).data.imageSelection.required).toBe(true);
});
it('never lets a publish-ready quote bypass pending media choice and rejects a changed selection', async () => {
  uncertainImage(); memory.rows.get(path).status = 'prepared';
  state.publication.mockResolvedValue({ ready: true, revision: 1, contentHash: 'b'.repeat(64), preparedHash: 'prepared', article: memory.rows.get(path).article });
  const preview = await chatSubmissionPreview(identity, id); expect(preview.confirmation?.action).toBe('media');
  memory.rows.get(`${path}/chatAssets/${'c'.repeat(64)}`).originalHash = 'f'.repeat(64);
  await expect(confirmChatSubmission(identity, { token: preview.confirmation!.token })).rejects.toThrow('preview_changed');
  expect(state.approve).not.toHaveBeenCalled();
});
it('replays a completed deliberate click without accepting twice', async () => {
  const { confirmation } = await chatSubmissionPreview(identity, id);
  const input = { token: confirmation!.token, localTime: 'now' };
  const first = await confirmChatSubmission(identity, input), second = await confirmChatSubmission(identity, input);
  expect(second).toEqual(first); expect(state.accept).toHaveBeenCalledTimes(1); expect(state.approve).not.toHaveBeenCalled();
});
it('rejects other users, another grant, missing scope, guessed tokens and changed versions', async () => {
  const { confirmation } = await chatSubmissionPreview(identity, id), input = { token: confirmation!.token };
  for (const changed of [{ uid: 'frederik' }, { grantId: 'another' }, { scopes: ['apropos:read'] }]) {
    await expect(confirmChatSubmission({ ...identity, ...changed }, input)).rejects.toThrow('confirmation_required');
  }
  await expect(confirmChatSubmission(identity, { token: 'z'.repeat(43) })).rejects.toThrow('confirmation_required');
  memory.rows.get(path).revision++;
  await expect(confirmChatSubmission(identity, input)).rejects.toThrow('preview_changed');
  expect(state.accept).not.toHaveBeenCalled();
});
it('does not retry an uncertain acceptance and refuses expired or repurposed tokens', async () => {
  const { confirmation } = await chatSubmissionPreview(identity, id);
  await expect(confirmChatSubmission(identity, { token: confirmation!.token, localTime: '2026-10-08T10:00' })).rejects.toThrow('invalid_schedule');
  state.accept.mockRejectedValue(Error('timeout'));
  await expect(confirmChatSubmission(identity, { token: confirmation!.token })).rejects.toThrow('timeout');
  await expect(confirmChatSubmission(identity, { token: confirmation!.token })).rejects.toThrow('confirmation_unconfirmed');
  expect(state.accept).toHaveBeenCalledTimes(1);
  const next = await chatSubmissionPreview(identity, id);
  memory.rows.get(`mcpUiConfirmations/${digest(next.confirmation!.token)}`).expiresAt = 0;
  await expect(confirmChatSubmission(identity, { token: next.confirmation!.token })).rejects.toThrow('preview_changed');
});
it('requires a fresh ready CMS preview and a separate publication confirmation', async () => {
  memory.rows.get(path).status = 'prepared';
  state.publication.mockResolvedValue({ ready: true, revision: 1, contentHash: 'b'.repeat(64), preparedHash: 'prepared', article: memory.rows.get(path).article });
  const { confirmation } = await chatSubmissionPreview(identity, id);
  expect(confirmation?.action).toBe('publish');
  await confirmChatSubmission(identity, { token: confirmation!.token, localTime: '2026-10-08T10:00' });
  expect(state.approve).toHaveBeenCalledWith('milo', id, 'prepared', '2026-10-08T10:00'); expect(state.accept).not.toHaveBeenCalled();
});
it('fails closed when blocked or when CMS is unavailable, never calling a paid probe', async () => {
  state.quote.mockResolvedValue({ canAccept: true, provider: { blocked: true } });
  expect((await chatSubmissionPreview(identity, id)).confirmation).toBeNull();
  memory.rows.get(path).status = 'prepared'; state.publication.mockRejectedValue(Error('CMS offline'));
  const preview = await chatSubmissionPreview(identity, id);
  expect(preview.confirmation).toBeNull(); expect(preview.data.dependencyError).toBeTruthy();
  expect(state.accept).not.toHaveBeenCalled(); expect(state.approve).not.toHaveBeenCalled();
});
it('offers an explicit personal zero-AI confirmation under provider hold only for human-review quotes', async () => {
  state.quote.mockResolvedValue({ revision: 1, contentHash: 'b'.repeat(64), canAccept: true, humanReview: true, provider: { blocked: true }, quoteId: 'human', estimateDkk: 0, ceilingDkkMicros: 0 });
  const result = await chatSubmissionPreview(identity, id);
  expect(result.confirmation?.action).toBe('checks');
  expect(result.data.quote).toMatchObject({ humanReview: true, estimateDkk: 0 });
  expect(state.accept).not.toHaveBeenCalled();
});
it('does not conflate historical published state with fresh readback or expose another user costs', async () => {
  memory.rows.get(path).status = 'published';
  expect((await chatSubmissionPreview(identity, id)).data).toMatchObject({ recordedPublished: true, publicationVerified: false });
  await expect(submissionCosts('casper', id)).rejects.toThrow('not_found');
  expect(await submissionCosts('milo', id)).toMatchObject({ actions: [], billedDkk: null, subscriptionUsage: 'not_observable_here' });
});
it('issues a hidden single-approval bearer for a complete ChatGPT-first version, requiring both scopes', async () => {
  const row = memory.rows.get(path); row.executionPolicy = 'chatgpt-first-v1'; row.choices.aiFinalChecks = 'human';
  row.article.featuredImage = 'https://cdn.prod.website-files.com/test/cover.jpg';
  row.article.content += '<figure><img src="https://cdn.prod.website-files.com/test/one.jpg" alt="Et"><figcaption>Foto</figcaption></figure><figure><img src="https://cdn.prod.website-files.com/test/two.jpg" alt="To"><figcaption>Foto</figcaption></figure>';
  const { confirmation, data } = await chatSubmissionPreview(identity, id);
  expect(confirmation?.action).toBe('approve_publish'); expect(JSON.stringify(data)).not.toContain(confirmation!.token);
  const withoutPublish = await chatSubmissionPreview({ ...identity, scopes: ['apropos:read', 'apropos:draft'] }, id);
  expect(withoutPublish.confirmation).toBeNull(); // no preparation-only fallback
  await expect(confirmChatSubmission({ ...identity, scopes: ['apropos:read', 'apropos:draft'] }, { token: confirmation!.token })).rejects.toThrow('confirmation_required');
  const first = await confirmChatSubmission(identity, { token: confirmation!.token });
  expect(first).toMatchObject({ accepted: true, queuedOnServer: true, paidAiCalls: 0 });
  expect(memory.rows.get(path)).toMatchObject({ status: 'processing', publicationConsent: { revision: 1, source: 'chat-preview' } });
  expect(await confirmChatSubmission(identity, { token: confirmation!.token })).toEqual(first);
  // Simulate a lost acknowledgement after the durable consent committed.
  Object.assign(memory.rows.get(`mcpUiConfirmations/${digest(confirmation!.token)}`), { status: 'attempted', expiresAt: 0 });
  expect(await confirmChatSubmission(identity, { token: confirmation!.token })).toMatchObject({ accepted: true, replay: true });
  expect([...memory.rows.keys()].filter(p => p.includes('/publicationConsents/'))).toHaveLength(1);
  // A read between CMS preparation and continuation must never reoffer approval.
  memory.rows.get(path).status = 'prepared';
  state.publication.mockResolvedValue({ ready: true, revision: 1, contentHash: 'b'.repeat(64), preparedHash: 'prepared', article: memory.rows.get(path).article });
  const continuing = await chatSubmissionPreview(identity, id);
  expect(continuing.data).toMatchObject({ consentPending: true, singleApproval: true, consent: null });
  expect(continuing.confirmation).toBeNull();
  expect(state.accept).not.toHaveBeenCalled(); expect(state.approve).not.toHaveBeenCalled();
});
it('offers the current version after stale consent instead of a duplicate preparation-only approval', async () => {
  const row = memory.rows.get(path); row.executionPolicy = 'chatgpt-first-v1'; row.choices.aiFinalChecks = 'human';
  row.article.featuredImage = 'https://cdn.prod.website-files.com/test/cover.jpg';
  row.article.content += '<figure><img src="https://cdn.prod.website-files.com/test/one.jpg" alt="Et"><figcaption>Foto</figcaption></figure><figure><img src="https://cdn.prod.website-files.com/test/two.jpg" alt="To"><figcaption>Foto</figcaption></figure>';
  row.publicationConsentPending = true; row.publicationConsent = { uid: 'milo', revision: 0, contentHash: 'old' };
  row.approval = { contentHash: row.contentHash };
  const preview = await chatSubmissionPreview(identity, id);
  expect(preview.data).toMatchObject({ consentPending: false, singleApproval: false, approvalState: 'preparation_only' });
  expect(preview.confirmation?.action).toBe('approve_publish');
  expect(state.accept).not.toHaveBeenCalled();
});
