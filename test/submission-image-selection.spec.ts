import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
vi.mock('@/lib/ai/provider-hold', () => ({ readProviderHold: async () => ({ blocked: true }) }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => ({ authors: [{ id: 'author' }], categories: [{ id: 'category' }], topics: [], requiredFields: [] }) }));
import { readSubmission } from '@/lib/editorial/submissions';
import { acceptImageSelection, readImageSelection, assertImageSelection } from '@/lib/editorial/submission-image-selection';
import { imageGenerationEvidence } from '@/lib/editorial/image-generation-evidence';
import { acceptSubmissionQuote, quoteSubmission } from '@/lib/editorial/submission-approval';
const id = 'a'.repeat(64), path = `editorialSubmissions/${id}`, assetPath = `${path}/chatAssets/${'c'.repeat(64)}`;
let memory: ReturnType<typeof memoryFirestore>;
beforeEach(() => {
  memory = memoryFirestore(); state.db = memory.db;
  memory.rows.set(path, { id, uid: 'owner', revision: 1, status: 'draft', contentHash: 'b'.repeat(64), executionPolicy: 'chat-final-checks-v1',
    article: { title: 'Artikel', content: '<p>Tekst</p>', featuredImage: 'https://images.test/image.png', subjectType: 'art', author: 'author', category: 'category',
      subtitle: 'Subtitle', intro: 'Intro', slug: 'artikel', seoTitle: 'Artikel', seoDescription: 'Beskrivelse' },
    research: [], choices: { kind: 'feature', media: 'provided', bodyImages: 'deferred', aiFinalChecks: 'human' } });
  memory.rows.set(assetPath, { uid: 'owner', assetId: 'c'.repeat(64), status: 'uploaded', role: 'cover', url: 'https://images.test/image.png', originalHash: 'd'.repeat(64),
    generationEvidence: imageGenerationEvidence({ kind: 'illustration', origin: 'chatgpt-generated' }, { prompt: 'Flat colours', referenceHash: 'e'.repeat(64) }) });
});
const selection = async () => readImageSelection(await readSubmission('owner', id));
it('blocks preparation even in human review; personal image choice is not approval of paid steps or publication', async () => {
  const quote = await quoteSubmission('owner', id);
  expect(quote).toMatchObject({ canAccept: false, estimateDkk: 0, humanReview: true });
  expect(quote.blockers).toContain('image_selection_required');
  await expect(acceptSubmissionQuote('owner', id, 1, quote.quoteId)).rejects.toThrow('quote_changed');
  const before = await selection();
  expect(await acceptImageSelection('owner', id, 1, before.selectionHash)).toMatchObject({ mediaSelected: true, publicationApproval: false });
  expect(memory.rows.get(path).status).toBe('draft'); expect(memory.rows.get(path).approval).toBeUndefined();
  const next = await quoteSubmission('owner', id); expect(next.canAccept).toBe(true);
  await acceptSubmissionQuote('owner', id, 1, next.quoteId);
  expect(memory.rows.get(path).status).toBe('processing');
});
it('rejects ownership, changed revision/identity and missing selection on the server', async () => {
  const before = await selection();
  await expect(acceptImageSelection('other', id, 1, before.selectionHash)).rejects.toThrow('not_found');
  await expect(assertImageSelection(await readSubmission('owner', id))).rejects.toThrow('image_selection_required');
  await expect(acceptImageSelection('owner', id, 2, before.selectionHash)).rejects.toThrow('preview_changed');
  memory.rows.get(assetPath).originalHash = 'f'.repeat(64);
  await expect(acceptImageSelection('owner', id, 1, before.selectionHash)).rejects.toThrow('preview_changed');
});
it('invalidates consent on article edits, replays exactly once, and leaves legacy assets untouched', async () => {
  const before = await selection(); await acceptImageSelection('owner', id, 1, before.selectionHash);
  expect(await acceptImageSelection('owner', id, 1, before.selectionHash)).toMatchObject({ replay: true });
  expect([...memory.rows.keys()].filter(k => k.includes('/mediaSelections/'))).toHaveLength(1);
  expect((await selection()).required).toBe(false);
  memory.rows.get(path).revision++;
  expect((await selection()).required).toBe(true);
  delete memory.rows.get(assetPath).generationEvidence;
  expect((await selection()).required).toBe(false);
});
it('ignores removed assets but fails closed on a truncated receipt window', async () => {
  memory.rows.get(assetPath).url = 'https://images.test/old.png';
  expect((await selection()).required).toBe(false);
  for (let n = 0; n < 100; n++) memory.rows.set(`${path}/chatAssets/extra-${n}`, { uid: 'owner' });
  await expect(selection()).rejects.toThrow('media_window_exceeded');
});
