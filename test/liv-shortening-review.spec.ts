import { beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ rows: new Map<string, any>(), baseline: vi.fn(), tail: Promise.resolve() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => {
  const doc = (id: string) => ({ id, get: async () => ({ data: () => structuredClone(io.rows.get(id)) }) });
  return { collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`) }),
    runTransaction: (fn: any) => {
      const run = io.tail.then(() => fn({ get: (ref: any) => ref.get(), create: (ref: any, value: any) => {
        if (io.rows.has(ref.id)) throw Error('exists'); io.rows.set(ref.id, structuredClone(value));
      } })); io.tail = run.then(() => undefined, () => undefined); return run;
    } };
} }));
vi.mock('@/lib/liv/shortening-baseline', () => ({ readLivShorteningBaseline: io.baseline }));
import { recordLivShorteningReview } from '@/lib/liv/shortening-review';
import { buildLivShorteningCandidate } from '@/lib/liv/shortening-candidate';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
const words = (n: number) => Array(n).fill('kultur').join(' ');
const article = { title: 'Artiklen', content: `<p>${words(200)}</p>`.repeat(3) } as GeneratedArticle;
const base = { itemId: 'a'.repeat(24), requestId: 'shortening-review-01', expectedPayloadHash: 'b'.repeat(64), expectedCmsHash: 'c'.repeat(64), targetWords: 500 };
const patches = { bodyEdits: [{ index: 0, before: words(200), after: words(100) }] };
const proposal = buildLivShorteningCandidate(article, 500, patches);
const candidateHash = cmsFieldHash({ content: proposal.content });
const input = { ...base, candidateHash, reviewedFactsAndMeaning: true };
const id = cmsFieldHash({ itemId: base.itemId, requestId: base.requestId });
const proposalKey = `livShorteningProposals/${id}`, reviewKey = `livShorteningReviews/${id}`;
beforeEach(() => {
  vi.clearAllMocks(); io.rows.clear(); io.tail = Promise.resolve();
  io.baseline.mockResolvedValue({ expectedCmsHash: base.expectedCmsHash, expectedPayloadHash: base.expectedPayloadHash });
  io.rows.set(proposalKey, { input: base, article, inputHash: cmsFieldHash({ input: base, article }), status: 'preview',
    rawResponse: JSON.stringify(patches), finishReason: 'stop', refusal: false, proposal: { ...proposal, candidateHash } });
});
it('records a human decision without changing proposal, CMS or original quality evidence', async () => {
  const original = JSON.stringify(io.rows.get(proposalKey));
  const result = await recordLivShorteningReview(input, 'verified-owner');
  expect(result).toMatchObject({ status: 'shortening_review_recorded', candidateHash, cmsChanged: false, publicationReady: false });
  expect(io.rows.get(reviewKey)).toMatchObject({ actorUid: 'verified-owner', modelVerified: false, kind: 'explicit-human-review' });
  expect(JSON.stringify(io.rows.get(proposalKey))).toBe(original);
  expect(await recordLivShorteningReview(input, 'verified-owner')).toEqual(result);
});
it('does not accept blanket consent without an exact preview acknowledgement', async () => {
  await expect(recordLivShorteningReview({ ...input, reviewedFactsAndMeaning: false }, 'owner')).rejects.toThrow('review_invalid');
  expect(io.rows.has(reviewKey)).toBe(false);
});
it('rejects a stale CMS version', async () => {
  io.baseline.mockResolvedValue({ expectedCmsHash: 'changed', expectedPayloadHash: base.expectedPayloadHash });
  await expect(recordLivShorteningReview(input, 'owner')).rejects.toThrow('version_changed');
});
it.each(['content', 'hash', 'raw', 'identity', 'status'])('rejects altered proposal %s', async change => {
  const row = io.rows.get(proposalKey);
  if (change === 'content') row.proposal.content += '<p>New claim</p>';
  if (change === 'hash') row.proposal.candidateHash = 'wrong';
  if (change === 'raw') row.rawResponse = '{}';
  if (change === 'identity') row.inputHash = 'wrong';
  if (change === 'status') row.status = 'generating';
  await expect(recordLivShorteningReview(input, 'owner')).rejects.toThrow(); expect(io.rows.has(reviewKey)).toBe(false);
});
it('cannot transfer a review to another actor or candidate', async () => {
  await recordLivShorteningReview(input, 'owner');
  await expect(recordLivShorteningReview(input, 'other')).rejects.toThrow('review_conflict');
  await expect(recordLivShorteningReview({ ...input, candidateHash: 'd'.repeat(64) }, 'owner')).rejects.toThrow('review_conflict');
});
it('deduplicates concurrent identical decisions', async () => {
  const results = await Promise.all([recordLivShorteningReview(input, 'owner'), recordLivShorteningReview(input, 'owner')]);
  expect(results[0]).toEqual(results[1]); expect(io.rows.size).toBe(2);
});
