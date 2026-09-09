import { beforeEach, expect, it, vi } from 'vitest';
import { checkSourceSimilarity } from '@/lib/liv/source-similarity';
import { SourceSimilarityError } from '@/lib/liv/source-similarity-error';

const mocks = vi.hoisted(() => ({ embedding: vi.fn(), cosine: vi.fn(), warn: vi.fn() }));
vi.mock('@/lib/embeddings', () => ({ getEmbedding: mocks.embedding, cosineSimilarity: mocks.cosine }));
vi.mock('@/lib/logger', () => ({ logger: { warn: mocks.warn } }));

const generated = 'Høflighed er hårdt arbejde for gæsterne omkring bordet. '.repeat(5);
const source = 'Four neighbours meet for an awkward dinner in a San Francisco apartment. '.repeat(5);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.embedding.mockResolvedValue([1, 2]);
  mocks.cosine.mockReturnValue(0.1);
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

it('still blocks literal overlap independently of embeddings', async () => {
  expect(await checkSourceSimilarity({ generated, source: generated })).toMatchObject({ pass: false, complete: true, failure: 'similarity-exceeded' });
});

it.each([true, false])('returns safe diagnostics for complete=%s', async complete => {
  const result = { pass: false, complete, scores: { embeddingSim: 0.9, openingSim: 0, ngramJaccard: 0 } };
  const error = new SourceSimilarityError(result, { url: 'https://example.com/private-path?secret=hidden', contentHash: 'sha256-fixture' });
  expect(error.status).toBe(complete ? 422 : 503);
  expect(error.detail.sourceHost).toBe('example.com');
  expect(JSON.stringify(error)).not.toMatch(/private-path|hidden/);
  expect(error.message).toContain('Ingen publicering');
});
