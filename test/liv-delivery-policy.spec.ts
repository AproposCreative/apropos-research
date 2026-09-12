import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
import { copenhagenClock, addDays, eligibleEntries, emptyDeliveryState, deliveryHealth,
  type ReadyEntry } from '@/lib/liv/delivery-policy';
import { selectDelivery } from '@/lib/liv/delivery-store';
import { preparationCandidates, defaultEditorialPlan } from '@/lib/liv/rolling-plan';

const day = '2026-09-11';
function entry(overrides: Partial<ReadyEntry> = {}): ReadyEntry {
  return { itemId: 'a'.repeat(24), slug: 'artikel', title: 'Artikel', scheduledDay: day, expiresDay: day,
    kind: 'scheduled', state: 'ready', preparedAt: '2026-09-10T12:00:00Z', payloadHash: 'b'.repeat(64), ...overrides };
}
describe('daily delivery policy', () => {
  it('prefers an approved eligible story and never uses an editorial rejection as fallback', () => {
    const state = emptyDeliveryState();
    state.entries = [entry({ decision: 'rejected' }), entry({ itemId: 'pending', kind: 'reserve' }),
      entry({ itemId: 'approved', kind: 'reserve', decision: 'approved' }),
      entry({ itemId: 'future', decision: 'approved', scheduledDay: '2026-09-12' })];
    expect(eligibleEntries(state, day).map(e => e.itemId)).toEqual(['approved', 'pending']);
    state.entries = [entry()];
    expect(eligibleEntries(state, day)).toHaveLength(1);
  });
  it('does not count editorial rejections as prepared inventory', () => {
    const state = emptyDeliveryState();
    state.entries = [entry({ kind: 'reserve', decision: 'rejected' }),
      entry({ scheduledDay: '2026-09-12', expiresDay: '2026-09-12', decision: 'rejected' })];
    expect(deliveryHealth(state, new Date('2026-09-11T08:00:00Z')).reserves).toBe(0);
    expect(preparationCandidates(state, day)[0]).toMatchObject({ dayKey: day, kind: 'scheduled' });
  });
  it('keeps 10:00 Copenhagen in summer and winter', () => {
    expect(copenhagenClock(new Date('2026-09-11T08:00:00Z'))).toEqual({ day, hour: 10 });
    expect(copenhagenClock(new Date('2026-12-11T09:00:00Z'))).toEqual({ day: '2026-12-11', hour: 10 });
    expect(copenhagenClock(new Date('2026-09-10T22:30:00Z')).day).toBe(day);
  });
  it('handles DST and year boundaries as calendar dates', () => {
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(() => addDays('2026-02-30', 1)).toThrow('invalid_day');
  });
  it('prioritizes the planned story and then the oldest usable reserve', () => {
    const state = emptyDeliveryState();
    state.entries = [entry({ itemId: 'b', kind: 'reserve' }), entry()];
    expect(eligibleEntries(state, day).map(e => e.itemId)).toEqual(['a'.repeat(24), 'b']);
  });
  it('never selects expired, rejected, future or another day’s scheduled stories', () => {
    const state = emptyDeliveryState();
    state.entries = [entry({ expiresDay: '2026-09-10' }), entry({ scheduledDay: '2026-09-12' }),
      entry({ state: 'rejected' }), entry({ scheduledDay: '2026-09-10' })];
    expect(eligibleEntries(state, day)).toEqual([]);
  });
  it('serializes duplicate invocations and permits no second story after publication', () => {
    const state = emptyDeliveryState(); state.entries = [entry(), entry({ itemId: 'reserve', kind: 'reserve' })];
    expect(selectDelivery(state, day, 100, 'first')?.itemId).toBe('a'.repeat(24));
    expect(selectDelivery(state, day, 101, 'second')).toBeNull();
    state.slots[day].state = 'published';
    expect(selectDelivery(state, day, 9999999, 'third')).toBeNull();
  });
  it('reclaims a crashed pre-write worker with the same item and a new fenced token', () => {
    const state = emptyDeliveryState(); state.entries = [entry()];
    selectDelivery(state, day, 100, 'first');
    const retry = selectDelivery(state, day, 400000, 'second');
    expect(retry).toMatchObject({ itemId: 'a'.repeat(24), token: 'second', attempts: 2, state: 'selected' });
  });
  it('never switches to a reserve after an ambiguous publish, even on the next day', () => {
    const state = emptyDeliveryState(); state.entries = [entry(), entry({ kind: 'reserve', itemId: 'reserve', expiresDay: '2026-09-20' })];
    selectDelivery(state, day, 100, 'first'); state.slots[day].state = 'attempted';
    expect(selectDelivery(state, '2026-09-12', 400000, 'next')).toBeNull();
    expect(selectDelivery(state, day, 400000, 'retry')?.state).toBe('attempted');
  });
  it('observes backoff rather than hammering the provider', () => {
    const state = emptyDeliveryState(); state.entries = [entry()];
    selectDelivery(state, day, 100, 'first');
    state.slots[day].leaseUntil = 0; state.slots[day].nextAttemptAt = 500000;
    expect(selectDelivery(state, day, 400000, 'retry')).toBeNull();
  });
  it('reports a missing daily publication, empty reserve and all seven uncovered dates', () => {
    const health = deliveryHealth(emptyDeliveryState(), new Date('2026-09-11T08:15:00Z'));
    expect(health).toMatchObject({ overdue: true, published: false, reserves: 0, reserveTarget: 3 });
    expect(health.missingDays).toHaveLength(7);
  });
  it('does not report overdue before the deadline', () => {
    expect(deliveryHealth(emptyDeliveryState(), new Date('2026-09-11T07:59:00Z')).overdue).toBe(false);
  });
  it('prepares today, tomorrow, then reserves and the rest of the week', () => {
    const jobs = preparationCandidates(emptyDeliveryState(), day);
    expect(jobs.slice(0, 5).map(j => j.kind)).toEqual(['scheduled', 'scheduled', 'reserve', 'reserve', 'reserve']);
    expect(jobs.filter(j => j.kind === 'scheduled')).toHaveLength(8);
  });
  it('does not generate another article for a covered day or spill into artificial future dates', () => {
    const state = emptyDeliveryState(); state.entries = [entry()];
    const jobs = preparationCandidates(state, day);
    expect(jobs[0].dayKey).toBe('2026-09-12');
    expect(jobs.every(j => j.dayKey <= addDays(day, 7))).toBe(true);
  });
  it('counts only ready unexpired reserves toward the target', () => {
    const state = emptyDeliveryState();
    state.entries = [0, 1, 2].map(i => entry({ itemId: String(i), kind: 'reserve' }));
    expect(preparationCandidates(state, day).some(j => j.kind === 'reserve')).toBe(false);
    state.entries[0].state = 'published';
    expect(preparationCandidates(state, day).some(j => j.kind === 'reserve')).toBe(true);
  });
  it('uses question-led features without fabricated current events or ratings as fallback', () => {
    const plan = defaultEditorialPlan(day, true);
    expect(plan).toMatchObject({ mustUseTrending: false, articleFormat: 'article' });
    expect(plan.directiveHint).toContain('Tidløs reserve');
    expect(plan.directiveHint).toContain('kildebelagte');
  });
});
