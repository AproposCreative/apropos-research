import { expect, it } from 'vitest';
import { costStories, costStageLabel } from '@/lib/ai/cost-overview';
import type { CostAction } from '@/lib/ai/cost-actions';
const action = (patch: Partial<CostAction> = {}): CostAction => ({ bucket: 'shared', scope: 'liv',
  runId: 'prepare-day', stage: 'research', lastAt: '2026-09-27T09:00:00.000Z', calls: 1,
  estimatedDkk: 1, reservedDkk: 0, unknownCalls: 0, repeatedRequests: 0, failure: null, ...patch });
it('includes failed spend and keeps unknown reservations separate', () => {
  const rows = costStories([action(), action({ stage: 'writing', estimatedDkk: 2, failure: 'provider_unavailable' }),
    action({ estimatedDkk: 0, reservedDkk: 3, unknownCalls: 1 })]);
  expect(rows[0]).toMatchObject({ id: 'prepare-day', estimatedDkk: 3, reservedDkk: 3, calls: 3, unknownCalls: 1 });
  expect(rows[0].stages.find(s => s.stage === 'research')).toMatchObject({ calls: 2, estimatedDkk: 1, reservedDkk: 3 });
});
it('combines explicit article identity but never merges separate budgets or unknown identities', () => {
  const rows = costStories([action({ storyId: 'story' }), action({ storyId: 'story', runId: 'retry' }),
    action({ storyId: 'story', bucket: 'image-gen' }), action({ runId: 'legacy-1' }), action({ runId: 'legacy-2' })]);
  expect(rows).toHaveLength(4);
  expect(rows.find(s => s.id === 'story' && s.bucket === 'shared')?.calls).toBe(2);
  expect(costStageLabel('writing')).toBe('Skrivning');
  expect(costStageLabel('future-stage')).toBe('future-stage');
  expect(costStories([])).toEqual([]);
});
