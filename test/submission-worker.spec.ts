import { beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { memoryFirestore } from './helpers/mcp-firestore';
const state = vi.hoisted(() => ({ db: null as any, hold: false, images: new Map<string, Buffer>(), checks: vi.fn(), visual: vi.fn(), save: vi.fn(), upload: vi.fn(), claim: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
vi.mock('@/lib/mcp/oauth', () => ({ activeOwner: async () => ({ owner: true }) }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => ({ authors: [{ id: 'author', name: 'Frederik' }], categories: [{ id: 'category', name: 'Kultur' }], topics: [], requiredFields: [], checkedAt: '' }) }));
vi.mock('@/lib/ai/provider-hold', () => ({ readProviderHold: async () => ({ blocked: state.hold }) }));
vi.mock('@/lib/liv/public-media-reader', () => ({ readPublicMedia: async (url: string) => state.images.get(url) }));
vi.mock('@/lib/images/text-free', () => ({ ensureTextFreeImage: async (bytes: Buffer) => ({ bytes }) }));
vi.mock('@/lib/image-gen/cms-asset', () => ({ uploadImageGenCmsAsset: (...args: unknown[]) => state.upload(...args) }));
vi.mock('@/lib/image-gen/jobs', () => ({ claimImageGenJob: (...args: unknown[]) => state.claim(...args), readImageGenJob: vi.fn() }));
vi.mock('@/lib/image-gen/runtime', () => ({ readImageGenAsset: vi.fn(), runImageGenJob: vi.fn() }));
vi.mock('@/lib/image-gen/quotes', () => ({ imageGenQuotes: vi.fn() }));
vi.mock('@/lib/liv/run-safety-gates', () => ({ runSafetyGates: (...args: unknown[]) => state.checks(...args) }));
vi.mock('@/lib/factcheck/source-reader', () => ({ retrieveSource: async () => ({ text: 'Official source', url: 'https://press.test' }), sourceUrl: (url: string) => new URL(url) }));
vi.mock('@/lib/openai', () => ({ getImageGenOpenAIClient: () => ({ chat: { completions: { create: (...args: unknown[]) => state.visual(...args) } } }) }));
vi.mock('@/lib/articles/writer-cms-save', () => ({ saveWriterCmsDraft: (...args: unknown[]) => state.save(...args) }));
vi.mock('@/lib/liv/cms-readback', () => ({ inspectLivCmsDraft: async () => ({ publicationReady: true, draftConfirmed: true, checks: [{ ok: true }], fieldDataHash: 'cms-proof' }) }));
import { runSubmissionStep } from '@/lib/editorial/submission-worker';
import { currentLivCostContext } from '@/lib/liv/cost-context';
const id = 'a'.repeat(64), hash = 'b'.repeat(64), path = `editorialSubmissions/${id}`;
let memory: ReturnType<typeof memoryFirestore>;
beforeEach(async () => {
  vi.clearAllMocks(); memory = memoryFirestore(); state.db = memory.db; state.hold = false;
  for (const [index, color] of ['red', 'blue', 'green'].entries()) state.images.set(`https://images.test/${index}.webp`, await sharp({ create: { width: 1200, height: 675, channels: 3, background: color } }).webp().toBuffer());
  const article = { title: 'En koncert', subtitle: 'En konkret vurdering', intro: 'Min indledning', slug: 'en-koncert', seoTitle: 'En koncert', seoDescription: 'Vurdering af koncerten',
    author: 'author', category: 'category', subjectType: 'music', articleFormat: 'article',
    featuredImage: 'https://images.test/0.webp', featuredImageAlt: 'Cover', fotoCredit: 'Fotografen',
    content: '<p>Min originale tekst.</p><figure><img src="https://images.test/1.webp" alt="Scenen"><figcaption>Foto: Fotografen</figcaption></figure><p>Mit andet afsnit.</p><figure><img src="https://images.test/2.webp" alt="Bandet"><figcaption>Foto: Fotografen</figcaption></figure>' };
  memory.rows.set(path, { id, uid: 'owner', revision: 1, status: 'processing', contentHash: hash, originalArticle: article, article,
    choices: { kind: 'feature', media: 'provided', style: 'expressive' }, research: [], approval: { uid: 'owner', contentHash: hash, acceptedAt: new Date().toISOString() } });
  state.visual.mockImplementation(async () => {
    expect(currentLivCostContext()).toMatchObject({ submissionId: id, contentVersion: hash });
    return { choices: [{ finish_reason: 'stop', message: { content: '{"pass":true,"detail":"Fixture review"}' } }] };
  });
  state.checks.mockResolvedValue({ pass: true, anyGateSkipped: false, results: [] });
  state.save.mockImplementation(async (_db: unknown, uid: string, draftId: string, payload: any, options: any) => {
    await options.beforeSave();
    memory.rows.set(`writerWorkspaces/${uid}/cmsSaves/${draftId}`, { expected: payload, phase: 'saved' });
    return { articleId: 'c'.repeat(24) };
  });
});
it('resumes one durable step at a time and preserves supplied prose/assets without regeneration', async () => {
  const original = memory.rows.get(path).article.content;
  for (let index = 0; index < 6; index++) await runSubmissionStep('owner', id);
  const row = memory.rows.get(path);
  expect(row.status).toBe('prepared'); expect(row.article.content).toBe(original);
  expect(row.assets.map((a: any) => a.url)).toEqual([...state.images.keys()]);
  expect(state.visual).toHaveBeenCalledTimes(1); expect(state.checks).toHaveBeenCalledTimes(1); expect(state.save).toHaveBeenCalledTimes(1);
  expect(state.upload).not.toHaveBeenCalled(); expect(state.claim).not.toHaveBeenCalled();
  await runSubmissionStep('owner', id);
  expect(state.save).toHaveBeenCalledTimes(1);
});
it('stops on provider hold before any paid step or CMS write', async () => {
  state.hold = true;
  expect(await runSubmissionStep('owner', id)).toMatchObject({ status: 'blocked', blocker: 'mcp_submission_provider_blocked' });
  expect(state.visual).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled();
});
it('does not rebuy an ambiguous stage and retains its response marker', async () => {
  memory.rows.set(`${path}/stages/${hash}-cover`, { status: 'attempted', name: 'cover', contentHash: hash, cmsAsset: { id: 'allocated' } });
  expect(await runSubmissionStep('owner', id)).toMatchObject({ blocker: 'mcp_submission_step_unconfirmed' });
  expect(memory.rows.get(`${path}/stages/${hash}-cover`).cmsAsset.id).toBe('allocated');
  expect(state.visual).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled();
});
it('refuses another user or a version not personally accepted', async () => {
  expect(await runSubmissionStep('other', id)).toEqual({ status: 'not_dispatched' });
  memory.rows.get(path).approval.contentHash = 'different';
  await expect(runSubmissionStep('owner', id)).rejects.toThrow('approval_required');
  expect(state.visual).not.toHaveBeenCalled();
});
