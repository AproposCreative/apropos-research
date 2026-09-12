import { expect, it } from 'vitest';
import { canRetryUnstartedPreparation, shouldExcludeLivTopic } from '@/lib/liv/preparation-retry';
it('retries unstarted no-topic, research and model failures', () => {
  expect(canRetryUnstartedPreparation({ status: 'skipped_no_topic' })).toBe(true);
  expect(canRetryUnstartedPreparation({ status: 'failed', reason: 'liv_trending_http_401', preparationAttempts: 1 })).toBe(true);
  expect(canRetryUnstartedPreparation({ status: 'failed', reason: 'research_sources_unavailable', preparationAttempts: 1 })).toBe(true);
});
it.each(['webflowItemId', 'articleCheckpoint', 'articleCheckpointHash', 'preparationProof', 'cmsSaveStarted'])('preserves existing work identified by %s', key => {
  expect(canRetryUnstartedPreparation({ status: 'skipped_no_topic', [key]: 'saved' })).toBe(false);
});

const now = Date.parse('2026-09-12T12:00:00Z');
const cooldown = 6 * 60 * 60 * 1000;
const sourceFailure = {
  status: 'failed', reason: 'research_sources_unavailable: Mindst to forskellige kildehosts kræves.',
  preparationAttempts: 3, completedAt: { toMillis: () => now - cooldown },
};
it('allows a source topic after cooldown without reopening an exhausted run', () => {
  expect(shouldExcludeLivTopic(sourceFailure, now)).toBe(false);
  expect(canRetryUnstartedPreparation(sourceFailure)).toBe(false);
  expect(shouldExcludeLivTopic(sourceFailure, now - 1)).toBe(true);
});
it('accepts Date completion timestamps and no-topic failures', () => {
  expect(shouldExcludeLivTopic({ status: 'skipped_no_topic', completedAt: new Date(now - cooldown) }, now)).toBe(false);
});
it.each(['webflowItemId', 'articleCheckpoint', 'articleCheckpointHash', 'preparationProof', 'cmsSaveStarted'])('never expires a topic with %s', key => {
  expect(shouldExcludeLivTopic({ ...sourceFailure, [key]: 'saved' }, now)).toBe(true);
});
it.each(['published', 'draft', 'processing', 'skipped_factcheck', 'skipped_moderation', 'skipped_tov', 'skipped_duplicate'])('retains %s topics regardless of the failure cooldown', status => {
  expect(shouldExcludeLivTopic({ ...sourceFailure, status }, now)).toBe(true);
});
it.each(['source_copy_detected', 'research_brief_evidence_missing', 'article_generation_refused', 'unknown', undefined])('does not expire unknown or quality failure %s', reason => {
  expect(shouldExcludeLivTopic({ ...sourceFailure, reason }, now)).toBe(true);
});
it.each([undefined, null, '2026-09-12', {}, new Date(NaN), { toMillis: () => NaN }, { toMillis: () => now + 1 }, { toMillis: () => { throw new Error('invalid'); } }])('retains failures without a trustworthy completion time: %j', completedAt => {
  expect(shouldExcludeLivTopic({ ...sourceFailure, completedAt }, now)).toBe(true);
});
it('fails closed for an invalid clock and accepts absent history', () => {
  expect(shouldExcludeLivTopic(sourceFailure, NaN)).toBe(true);
  expect(shouldExcludeLivTopic(undefined, now)).toBe(false);
});
it.each(['processing', 'published', 'draft', 'skipped_factcheck', 'skipped_duplicate', 'skipped_tov'])('does not reopen %s indiscriminately', status => {
  expect(canRetryUnstartedPreparation({ status })).toBe(false);
});
it.each([3, 4, -1, '1', NaN, 1.5])('rejects exhausted or invalid attempt counts %s', preparationAttempts => {
  expect(canRetryUnstartedPreparation({ status: 'skipped_no_topic', preparationAttempts })).toBe(false);
});
