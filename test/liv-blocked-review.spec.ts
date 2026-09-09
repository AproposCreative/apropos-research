import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { SourceSimilarityError } from '@/lib/liv/source-similarity-error';
import { readBlockedSourceReview } from '@/lib/liv/blocked-review';

const review = { text: 'Draft text <script>untrusted markup</script>', model: 'fixture', voiceVersion: 'voice1' };
const makeError = (text = review.text) => new SourceSimilarityError({ pass: false, complete: true,
  scores: { embeddingSim: 0.8, ngramJaccard: 0.3, openingSim: 0 } },
{ url: 'https://example.com/film', contentHash: 'hash' }, { ...review, text });
const envelope = () => ({ ok: false, code: 'source_similarity_unapproved', gatePass: false, canAutoPublish: false,
  blockedReview: makeError().blockedReview });

it('binds review text to an exact hash but excludes it from error serialization/log metadata', () => {
  const error = makeError();
  expect(error.blockedReview?.textHash).toBe(createHash('sha256').update(review.text).digest('hex'));
  expect(JSON.stringify(error)).not.toContain('Draft text');
  expect(JSON.stringify(error.detail)).not.toContain('Draft text');
  expect(error.message).not.toContain('Draft text');
});
it('accepts only the explicitly blocked response, preserving plain text without Article fields', () => {
  const data = readBlockedSourceReview(envelope());
  expect(data?.text).toBe(review.text);
  expect(data).not.toHaveProperty('content');
  expect(data).not.toHaveProperty('canAutoPublish');
});
it.each([{ ok: true }, { gatePass: true }, { canAutoPublish: true }, { code: 'other' }, { blockedReview: null }])('rejects a non-blocked/invalid response %o', override => {
  expect(readBlockedSourceReview({ ...envelope(), ...override })).toBeNull();
});
it('does not return oversized or empty diagnostic text', () => {
  expect(makeError('x'.repeat(60001)).blockedReview).toBeUndefined();
  expect(makeError(' ').blockedReview).toBeUndefined();
});
