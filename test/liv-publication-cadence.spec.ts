import { expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
import { addDays, emptyDeliveryState, isPublicationDay, nextPublicationDay, publicationTime,
  scheduledPreparationDays, deliveryHealth, type ReadyEntry } from '@/lib/liv/delivery-policy';
import { selectDelivery } from '@/lib/liv/delivery-store';
import { deliveryAlertKind } from '@/lib/liv/delivery-alerts';
import { nextScheduledPreparation } from '@/lib/liv/next-preparation';
import { preparationCandidates } from '@/lib/liv/rolling-plan';
import { reserveNeeded } from '@/lib/liv/reserve-preparation';
import { weeklyStory } from '@/lib/liv/weekly-plan';
import { livOperationsSnapshot } from '@/lib/liv/operations-snapshot';

const entry = (day: string, extra: Partial<ReadyEntry> = {}): ReadyEntry => ({
  itemId: day, slug: 'saved', title: 'Saved', scheduledDay: day, expiresDay: day,
  kind: 'scheduled', state: 'ready', preparedAt: '2026-10-01T08:00:00Z', payloadHash: 'a'.repeat(64), ...extra,
});
it('keeps historic daily policy and starts every other day on October 2', () => {
  expect(isPublicationDay('2026-09-30')).toBe(true);
  expect(isPublicationDay('2026-10-01')).toBe(false);
  expect(['2026-10-02', '2026-10-04', '2026-10-06'].every(isPublicationDay)).toBe(true);
  expect(isPublicationDay('2026-10-03')).toBe(false);
  expect(nextPublicationDay('2026-10-02')).toBe('2026-10-04');
  expect(nextPublicationDay('2026-10-02', true)).toBe('2026-10-02');
  expect(() => isPublicationDay('2026-02-30')).toThrow('invalid_day');
});
it('does not restart its interval at month, year or DST boundaries', () => {
  expect(nextPublicationDay('2026-10-30')).toBe('2026-11-01');
  expect(nextPublicationDay('2026-12-31')).toBe('2027-01-02');
  expect(nextPublicationDay('2026-10-24')).toBe('2026-10-26');
  expect(publicationTime('2026-10-24')).toBe('2026-10-24T08:00:00.000Z');
  expect(publicationTime('2026-10-26')).toBe('2026-10-26T09:00:00.000Z');
  expect(Array.from({ length: 31 }, (_, i) => addDays('2026-10-01', i)).filter(isPublicationDay)).toHaveLength(15);
});
it('uses at most today plus the next due day, not daily or speculative weekly preparation', () => {
  const state = emptyDeliveryState();
  expect(scheduledPreparationDays(state, '2026-10-01')).toEqual(['2026-10-02']);
  expect(scheduledPreparationDays(state, '2026-10-02')).toEqual(['2026-10-02', '2026-10-04']);
  expect(scheduledPreparationDays(state, '2026-10-03')).toEqual(['2026-10-04']);
  expect(preparationCandidates(state, '2026-10-03')).toEqual([{ dayKey: '2026-10-04', kind: 'scheduled' }]);
});
it('does not let an old off-day failure dispatch a paid worker', async () => {
  const state = emptyDeliveryState();
  const read = vi.fn(async (day: string) => day === '2026-10-03' ? { status: 'failed', reason: 'article_evidence_insufficient' } : undefined);
  expect(await nextScheduledPreparation(state, read, new Date('2026-10-03T08:30:00Z'))).toMatchObject({ dayKey: '2026-10-04' });
  expect(read).toHaveBeenCalledExactlyOnceWith('2026-10-04', 'prepare');
});
it('keeps one durable reserve and buys no daily replacements once next due day is covered', () => {
  const state = emptyDeliveryState();
  state.entries = [entry('2026-10-04')];
  expect(preparationCandidates(state, '2026-10-03')).toEqual([]);
  expect(reserveNeeded(state, '2026-10-03')).toBe(true);
  state.entries.push(entry('2026-10-02', { kind: 'reserve', expiresDay: '2026-10-07' }));
  expect(reserveNeeded(state, '2026-10-03')).toBe(false);
});
it('shows an honest free day and next due date, without overdue alerts or deleting saved data', () => {
  const state = emptyDeliveryState(); state.entries = [entry('2026-10-03')];
  const before = structuredClone(state), now = new Date('2026-10-03T19:00:00Z');
  expect(deliveryHealth(state, now)).toMatchObject({ publicationDay: false, publicationIntervalDays: 2,
    overdue: false, missingDays: ['2026-10-04'] });
  expect(deliveryAlertKind(state, {}, now)).toBeNull();
  expect(weeklyStory('2026-10-03', state, { topicHint: 'Old plan' })).toMatchObject({ status: 'off_day', itemId: null });
  expect(livOperationsSnapshot(state, { day: null, scope: null, runStatus: null, status: 'idle', reasonCode: 'no_preparation_needed' }, now))
    .toMatchObject({ nextDay: '2026-10-04', today: { status: 'off_day' } });
  expect(selectDelivery(state, '2026-10-03', now.getTime(), 'worker')).toBeNull();
  expect(state).toEqual(before);
});
it('still warns and reports missing publication on actual due days', () => {
  const state = emptyDeliveryState(), now = new Date('2026-10-04T08:16:00Z');
  expect(deliveryHealth(state, now)).toMatchObject({ publicationDay: true, overdue: true, missingDays: ['2026-10-06'] });
  expect(deliveryAlertKind(state, {}, now)).toBe('failure');
});
it('preserves published history and unresolved external write readback on a newly free day', () => {
  const state = emptyDeliveryState(); state.entries = [entry('2026-10-01', { state: 'selected' })];
  state.slots['2026-10-01'] = { itemId: '2026-10-01', state: 'attempted', leaseUntil: 0, nextAttemptAt: 0, attempts: 1, token: 'old' };
  expect(weeklyStory('2026-10-01', state).status).toBe('blocked');
  expect(selectDelivery(state, '2026-10-01', 1, 'readback')?.state).toBe('attempted');
  state.slots['2026-10-01'].state = 'published';
  expect(weeklyStory('2026-10-01', state).status).toBe('published');
});
