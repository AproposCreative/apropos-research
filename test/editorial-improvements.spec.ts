import { expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
import { projectCostActions } from '@/lib/ai/cost-actions';
import { costTotals } from '@/lib/ai/cost-totals';
import { providerFailure } from '@/lib/ai/provider-error';
import { livOperationsSnapshot } from '@/lib/liv/operations-snapshot';
import { decidePreparation } from '@/lib/liv/preparation-policy';
import type { DeliveryState } from '@/lib/liv/delivery-policy';
const call = { runId: 'prepare-2026-09-21', stage: 'research', scope: 'liv', requestHash: 'a'.repeat(64),
  createdAt: '2026-09-21T08:00:00Z', reservedDkkMicros: 2000000, prompt: 'private' };
it('separates known estimates, retained reservations and duplicate fingerprints without leaking content', () => {
  const result = projectCostActions([{ call, receipt: { usageBasedUpperDkkMicros: 100000, reservationRetained: false } },
    { call, receipt: { reservationRetained: true, outcome: { httpStatus: 429, providerFailure: 'quota_exhausted', error: 'secret' } } }], 'shared');
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ calls: 2, estimatedDkk: 0.1, reservedDkk: 2, unknownCalls: 1, repeatedRequests: 1, failure: 'quota_exhausted' });
  expect(JSON.stringify(result)).not.toMatch(/private|secret|requestHash|prompt/);
});
it('never calls a missing receipt free and keeps different runs/stages distinct', () => {
  expect(projectCostActions([{ call }, { call: { ...call, runId: 'another' } }, { call: { ...call, stage: 'image' } }], 'image-gen'))
    .toHaveLength(3);
  expect(projectCostActions([{ call }], 'image-gen')[0]).toMatchObject({ unknownCalls: 1, reservedDkk: 2 });
});
it('rejects corrupted totals instead of reporting zero', () => {
  expect(costTotals({ committedDkkMicros: 1200000, reservedDkkMicros: 200000, calls: 4 }))
    .toEqual({ estimatedDkk: 1.2, reservedDkk: 0.2, trackedCalls: 4 });
  for (const bad of [undefined, {}, { committedDkkMicros: -1, reservedDkkMicros: 0, calls: 1 }]) expect(() => costTotals(bad)).toThrow();
  expect(() => projectCostActions([{ call: { ...call, runId: '<unsafe>' } }], 'shared')).toThrow();
});
it.each([
  [{ status: 429, code: 'insufficient_quota' }, 'quota_exhausted'],
  [{ status: 429, code: 'rate_limit_exceeded' }, 'rate_limited'],
  [{ status: 401 }, 'authentication_failed'], [{ status: 403 }, 'access_denied'],
  [{ status: 500 }, 'provider_unavailable'], [{ message: 'secret' }, null],
])('classifies provider metadata without exposing its text', (error, expected) => expect(providerFailure(error)).toBe(expected));
it('halts quota failures without spending an automatic alternative', () => {
  expect(decidePreparation({ status: 'failed', reason: 'research_provider_quota_exhausted' }))
    .toMatchObject({ action: 'blocked', reasonCode: 'provider_quota_exhausted' });
});
const idle = { day: null, scope: null, runStatus: null, status: 'idle', reasonCode: 'no_preparation_needed' } as const;
it('requires a safe saved live receipt and shows its verification time', () => {
  const state: DeliveryState = { entries: [], slots: { '2026-09-21': { itemId: 'item', token: 'secret', state: 'published', leaseUntil: 0, attempts: 1, nextAttemptAt: 0 } } };
  const now = new Date('2026-09-21T10:00:00Z');
  expect(livOperationsSnapshot(state, idle, now).today.status).toBe('recorded_unverified');
  Object.assign(state.slots['2026-09-21'], { publicUrl: 'https://www.aproposmagazine.com/articles/test-story', checkedAt: '2026-09-21T08:00:00Z' });
  expect(livOperationsSnapshot(state, idle, now).today).toMatchObject({ status: 'verified_live', verifiedAt: '2026-09-21T08:00:00Z' });
  state.slots['2026-09-21'].publicUrl = 'javascript:unsafe';
  expect(livOperationsSnapshot(state, idle, now).today.publicUrl).toBeNull();
});
