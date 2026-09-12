import { beforeEach, expect, it, vi } from 'vitest';
import { checkSourceSimilarity, lexicalSourceScores } from '@/lib/liv/source-similarity';
import { independentDinnerTexts } from './fixtures/danish-originality';
import { SourceSimilarityError } from '@/lib/liv/source-similarity-error';

const mocks = vi.hoisted(() => ({ embedding: vi.fn(), cosine: vi.fn(), warn: vi.fn(), review: vi.fn() }));
vi.mock('@/lib/liv/semantic-source-review', () => ({ reviewSemanticSource: mocks.review }));
vi.mock('@/lib/embeddings', () => ({ getEmbedding: mocks.embedding, cosineSimilarity: mocks.cosine }));
vi.mock('@/lib/logger', () => ({ logger: { warn: mocks.warn } }));

const generated = 'Høflighed er hårdt arbejde for gæsterne omkring bordet. '.repeat(5);
const source = 'Four neighbours meet for an awkward dinner in a San Francisco apartment. '.repeat(5);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.embedding.mockResolvedValue([1, 2]);
  mocks.cosine.mockReturnValue(0.1);
  mocks.review.mockResolvedValue({ decision: 'uncertain', reason: 'Insufficient comparative evidence.' });
});

it('approves a completed comparison with low scores', async () => {
  expect(await checkSourceSimilarity({ generated, source })).toMatchObject({ pass: true, complete: true });
});

it('does not approve insufficient input or call the provider', async () => {
  expect(await checkSourceSimilarity({ generated, source: 'short' })).toMatchObject({ pass: false, complete: false, failure: 'input-too-short' });
  expect(mocks.embedding).not.toHaveBeenCalled();
});

it('distinguishes provider failure from excessive similarity without exposing its error', async () => {
  mocks.embedding.mockRejectedValue(new Error('private-provider-details'));
  const result = await checkSourceSimilarity({ generated, source });
  expect(result).toMatchObject({ pass: false, complete: false, failure: 'embedding-unavailable' });
  expect(JSON.stringify([result, mocks.warn.mock.calls])).not.toContain('private-provider-details');
});

it.each([[], [0, 0], [NaN, 1], [Infinity, 1], [1]].map(vector => ({ vector })))('rejects invalid embedding $vector', async ({ vector }) => {
  mocks.embedding.mockResolvedValueOnce(vector).mockResolvedValueOnce([1, 2]);
  expect(await checkSourceSimilarity({ generated, source })).toMatchObject({ pass: false, complete: false, failure: 'embedding-invalid' });
});

it('still blocks high semantic similarity', async () => {
  mocks.cosine.mockReturnValue(0.9);
  expect(await checkSourceSimilarity({ generated, source })).toMatchObject({ pass: false, complete: true, failure: 'similarity-exceeded' });
});

it('allows a complete semantic-only trigger only with independent qualitative evidence and returns it', async () => {
  mocks.cosine.mockReturnValue(0.892823);
  const review = { decision: 'independent', reviewId: 'cached-review', evidence: [{ aspect: 'structure' }] };
  mocks.review.mockResolvedValue(review);
  const result = await checkSourceSimilarity({ generated, source });
  expect(result).toMatchObject({ pass: true, complete: true, semanticReview: review, scores: { embeddingSim: 0.892823 } });
  expect(mocks.review).toHaveBeenCalledWith(generated.trim(), source.trim());
});

it.each(['copied', 'ngram', 'opening', 'embedding-unavailable', 'embedding-invalid', 'below-threshold'])('never invokes semantic review for %s', async kind => {
  mocks.cosine.mockReturnValue(kind === 'below-threshold' ? 0.2 : 0.9);
  if (kind === 'embedding-unavailable') mocks.embedding.mockRejectedValue(new Error('unavailable'));
  if (kind === 'embedding-invalid') mocks.embedding.mockResolvedValue([]);
  await checkSourceSimilarity({ generated, source: kind === 'copied' ? generated : source,
    thresholds: kind === 'ngram' ? { ngram: -1 } : kind === 'opening' ? { opening: -1 } : undefined });
  expect(mocks.review).not.toHaveBeenCalled();
});

it('fails closed without exposing invalid review or provider text', async () => {
  mocks.cosine.mockReturnValue(0.9);
  mocks.review.mockRejectedValue(new Error('private source and provider details'));
  const result = await checkSourceSimilarity({ generated, source });
  expect(result).toMatchObject({ pass: false, complete: false, failure: 'semantic-review-unavailable' });
  expect(JSON.stringify(result)).not.toContain('private');
});

it('still blocks literal overlap independently of embeddings', async () => {
  expect(await checkSourceSimilarity({ generated, source: generated })).toMatchObject({ pass: false, complete: true, failure: 'similarity-exceeded' });
});

it('does not confuse shared Danish fragments with five-word sequences in independent same-topic controls', async () => {
  const [generated, source] = independentDinnerTexts;
  const lexical = lexicalSourceScores(generated, source);
  // This short pair has ~16% common character fragments without shared phrasing.
  // It is a control, not evidence that the previous The Invite flag was false.
  expect(lexical.characterJaccard).toBeGreaterThan(0.1);
  expect(lexical.ngramJaccard).toBeLessThan(0.01);
  expect(lexical.copiedPassage).toBe(false);
  expect(await checkSourceSimilarity({ generated, source })).toMatchObject({ pass: true, method: 'word-5gram-v2' });
});

it('blocks copied and punctuation-disguised paragraphs anywhere in a long article', async () => {
  const [original, independent] = independentDinnerTexts;
  const copied = original.split('\n')[1].replaceAll(' ', ', ');
  const result = await checkSourceSimilarity({ generated: independent.repeat(8) + copied, source: original });
  expect(result).toMatchObject({ pass: false, complete: true, scores: { copiedPassage: true } });
});

it('blocks patchwriting with repeated five-word chunks despite avoiding a twelve-word run', async () => {
  const source = independentDinnerTexts[0];
  const words = source.match(/[\p{L}\p{N}]+/gu)!;
  const chunks = [];
  for (let i = 0; i < words.length; i += 10) chunks.push(words.slice(i, i + 10).join(' '));
  const generated = chunks.reverse().join(' omskrevet ');
  expect((await checkSourceSimilarity({ generated, source })).pass).toBe(false);
});

it('does not silently truncate oversized input into approval', async () => {
  expect(await checkSourceSimilarity({ generated: 'x'.repeat(60001), source })).toMatchObject({ pass: false, complete: false, failure: 'input-too-long' });
  expect(mocks.embedding).not.toHaveBeenCalled();
});

it.each([true, false])('returns safe diagnostics for complete=%s', async complete => {
  const result = { pass: false, complete, scores: { embeddingSim: 0.9, openingSim: 0, ngramJaccard: 0 } };
  const error = new SourceSimilarityError(result, { url: 'https://example.com/private-path?secret=hidden', contentHash: 'sha256-fixture' });
  expect(error.status).toBe(complete ? 422 : 503);
  expect(error.detail.sourceHost).toBe('example.com');
  expect(JSON.stringify(error)).not.toMatch(/private-path|hidden/);
  expect(error.message).toContain('Ingen publicering');
});
