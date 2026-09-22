import { expect, it } from 'vitest';
import { costOverview } from '@/lib/ai/cost-overview';
import type { CostAction } from '@/lib/ai/cost-actions';

const action = (overrides: Partial<CostAction> = {}): CostAction => ({
  bucket: 'shared', scope: 'liv', runId: 'test', stage: 'writing', lastAt: '2026-09-22T10:00:00Z',
  calls: 1, estimatedDkk: 2, reservedDkk: 0, unknownCalls: 0, repeatedRequests: 0, failure: null, ...overrides,
});
it('separates purposes and image budgets and never adds reservations to spend', () => {
  const result = costOverview([
    action({ purpose: 'production' }), action({ purpose: 'production', estimatedDkk: 0, reservedDkk: 8, unknownCalls: 1 }),
    action({ purpose: 'development-pilot' }), action({ purpose: 'editorial-change' }),
    action({ bucket: 'image-gen', purpose: 'production' }), action(),
  ]);
  expect(result).toHaveLength(5);
  expect(result.find(row => row.label === 'Liv, Writer og SEO · Drift')).toEqual({ label: 'Liv, Writer og SEO · Drift', estimatedDkk: 2, reservedDkk: 8, calls: 2 });
  expect(result.some(row => row.label.endsWith('Uden formålsmærkning'))).toBe(true);
  expect(result.reduce((sum, row) => sum + row.estimatedDkk, 0)).toBe(10);
  expect(costOverview([])).toEqual([]);
});
