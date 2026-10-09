import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  read: vi.fn(), snapshot: vi.fn(), inspect: vi.fn(), get: vi.fn(), set: vi.fn(), authors: vi.fn(),
}));
vi.mock('@/lib/editorial/submissions', () => ({
  readSubmission: mock.read,
  submissionStore: () => ({ collection: { doc: () => ({ collection: () => ({ doc: () => ({ get: mock.get, set: mock.set }) }) }) } }),
}));
vi.mock('@/lib/image-gen/press', () => ({ inspectImageGenPressSources: mock.inspect }));
vi.mock('@/lib/image-gen/snapshot', () => ({ readImageGenSnapshot: mock.snapshot }));
vi.mock('@/lib/webflow-service', () => ({ getWebflowAuthors: mock.authors }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
import { coverSelectionPolicy, COVER_SELECTION_INSTRUCTION } from '@/lib/editorial/cover-selection-policy';
import { TEXT_FREE_IMAGE_POLICY } from '@/lib/images/text-free-policy';
import { findSubmissionImages, submissionMediaContext } from '@/lib/editorial/submission-media';
import { editorialWorkflow } from '@/lib/editorial/workflows';
import { editorialContext } from '@/lib/mcp/editorial';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';

const id = 'a'.repeat(64), contentHash = 'b'.repeat(64), source = 'https://www.playstation.com/en-us/games/marvels-wolverine/';
beforeEach(() => {
  vi.clearAllMocks();
  mock.read.mockResolvedValue({ id, revision: 4, contentHash, article: { imageSourceUrls: [source] }, research: [], choices: { media: 'official', style: 'expressive' } });
  mock.get.mockResolvedValue({ data: () => undefined });
  mock.inspect.mockResolvedValue({ images: [{ url: 'https://example.com/screenshot.jpg', rights: 'unknown' }] });
  mock.snapshot.mockResolvedValue({ sections: [{ sectionId: 'one', text: 'Saved text' }] });
  mock.authors.mockResolvedValue([{ id: 'peter', name: 'Peter Milo', tov: 'Human author voice' }]);
});

it('versions selection guidance without certifying pixels, changing existing image policy or enabling paid work', () => {
  const { policyHash, ...policy } = coverSelectionPolicy();
  expect(policy).toMatchObject({ version: 'apropos-cover-selection-2026-10-09-v1', imagePolicyVersion: TEXT_FREE_IMAGE_POLICY,
    visualInspectionPerformed: false, publicationApproval: false });
  expect(policyHash).toBe(cmsFieldHash(policy));
  expect(TEXT_FREE_IMAGE_POLICY).toBe('apropos-text-free-v1');
  for (const text of ['mobilcovers', 'logoer og vandmærker', 'Vælg et andet originalbillede', 'bestiller ingen AI-kontrol',
    'Bevar faktisk kilde og kredit', 'bogcover-særvalg', 'lydafspilleren']) expect(policy.instruction).toContain(text);
});

it('returns current cover selection guidance with a fresh free search, without declaring images approved', async () => {
  const result = await findSubmissionImages('frederik', { submissionId: id, expectedRevision: 4 });
  expect(result).toMatchObject({ reused: false, paidAiCalls: 0, publicationApproval: false, coverSelectionPolicy: coverSelectionPolicy() });
  expect(mock.inspect).toHaveBeenCalledExactlyOnceWith([source]);
  expect(mock.set).toHaveBeenCalledOnce();
  expect(mock.read).toHaveBeenCalledExactlyOnceWith('frederik', id);
});

it('applies current guidance to old cached searches without refetching, rewriting the cache or changing inspection time', async () => {
  const cached = { images: [{ url: 'https://example.com/old.jpg', rights: 'unknown' }], checkedAt: '2026-09-20T10:00:00Z',
    paidAiCalls: 0, publicationApproval: false, coverSelectionPolicy: { version: 'old' } };
  mock.get.mockResolvedValue({ data: () => cached });
  const result = await findSubmissionImages('frederik', { submissionId: id, expectedRevision: 4 });
  expect(result).toMatchObject({ ...cached, reused: true, coverSelectionPolicy: coverSelectionPolicy() });
  expect(mock.inspect).not.toHaveBeenCalled(); expect(mock.set).not.toHaveBeenCalled();
  expect(cached.coverSelectionPolicy.version).toBe('old');
});

it('keeps expected-revision enforcement before cache or source access', async () => {
  await expect(findSubmissionImages('frederik', { submissionId: id, expectedRevision: 3 })).rejects.toThrow('mcp_submission_revision_conflict');
  expect(mock.get).not.toHaveBeenCalled(); expect(mock.inspect).not.toHaveBeenCalled();
});

it('preserves saved section binding and content when exposing image selection context', async () => {
  expect(await submissionMediaContext('frederik', id)).toMatchObject({ revision: 4, contentHash,
    sections: [{ sectionId: 'one', text: 'Saved text' }], coverSelectionPolicy: coverSelectionPolicy() });
  expect(mock.snapshot).toHaveBeenCalledExactlyOnceWith('frederik', `submission-${id}`);
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.inspect).not.toHaveBeenCalled();
});

it.each(['submit', 'publish'])('exposes the policy in the %s workflow without permitting publication', workflow => {
  const result = editorialWorkflow({ workflow });
  expect(result).toMatchObject({ coverSelectionPolicy: coverSelectionPolicy(), paidAiCalls: 0, publicationApproval: false });
  expect(result.instructions).toContain(COVER_SELECTION_INSTRUCTION);
  expect(result.versionHash).toMatch(/^[a-f0-9]{64}$/);
});

it.each(['read', 'review', 'edit'])('does not inject media selection into unrelated %s guidance', workflow => {
  expect(editorialWorkflow({ workflow }).instructions).not.toContain(COVER_SELECTION_INSTRUCTION);
});

it('returns the same image policy for structure/all, without altering a human author voice or structure hash', async () => {
  const structure = await editorialContext(undefined, 'structure');
  expect(structure.coverSelectionPolicy).toEqual(coverSelectionPolicy());
  expect(mock.authors).not.toHaveBeenCalled();
  const all = await editorialContext('peter', 'all'), voice = await editorialContext('peter', 'voice');
  expect(all).toMatchObject({ rulesHash: structure.rulesHash, author: 'Peter Milo', coverSelectionPolicy: coverSelectionPolicy(),
    voice: { text: 'Human author voice' } });
  expect(voice).not.toHaveProperty('coverSelectionPolicy');
});
