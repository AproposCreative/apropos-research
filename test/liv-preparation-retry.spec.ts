import { expect, it } from 'vitest';
import { canRetryUnstartedPreparation } from '@/lib/liv/preparation-retry';
it('retries unstarted no-topic, research and model failures', () => {
  expect(canRetryUnstartedPreparation({ status: 'skipped_no_topic' })).toBe(true);
  expect(canRetryUnstartedPreparation({ status: 'failed', reason: 'liv_trending_http_401', preparationAttempts: 1 })).toBe(true);
  expect(canRetryUnstartedPreparation({ status: 'failed', reason: 'research_sources_unavailable', preparationAttempts: 1 })).toBe(true);
});
it.each(['webflowItemId', 'articleCheckpoint', 'articleCheckpointHash', 'preparationProof'])('preserves existing work identified by %s', key => {
  expect(canRetryUnstartedPreparation({ status: 'skipped_no_topic', [key]: 'saved' })).toBe(false);
});
it.each(['processing', 'published', 'draft', 'skipped_factcheck', 'skipped_duplicate', 'skipped_tov'])('does not reopen %s indiscriminately', status => {
  expect(canRetryUnstartedPreparation({ status })).toBe(false);
});
it.each([3, 4, -1, '1', NaN, 1.5])('rejects exhausted or invalid attempt counts %s', preparationAttempts => {
  expect(canRetryUnstartedPreparation({ status: 'skipped_no_topic', preparationAttempts })).toBe(false);
});
