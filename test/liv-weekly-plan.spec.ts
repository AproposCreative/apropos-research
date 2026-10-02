import { expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
import { weeklyStory, applyPreparationStatusToWeek, type WeeklyStory } from '@/lib/liv/weekly-plan';
import { emptyDeliveryState } from '@/lib/liv/delivery-policy';
const day = '2026-09-26';
it('does not label a scheduled source-bank lookup as active writing', () => {
  const now = Date.now();
  expect(weeklyStory(day, emptyDeliveryState(), undefined,
    { status: 'skipped_no_topic', completedAt: now }, undefined, now))
    .toMatchObject({ status: 'planned', detail: 'Afventer næste forberedelseskørsel.' });
});
it('projects the effective provider block only onto the affected unfinished date', () => {
  const week: WeeklyStory[] = ['preparing', 'ready', 'published', 'off_day', 'planned', 'unplanned'].map((status, i) => ({
    day: i === 4 ? '2026-10-06' : '2026-10-04', title: 'Saved title', itemId: null,
    status: status as WeeklyStory['status'], detail: 'Saved detail' }));
  const before = structuredClone(week);
  const prep = { day: '2026-10-04', scope: 'prepare', status: 'blocked_saved_work', runStatus: 'skipped_no_topic',
    reasonCode: 'provider_quota_exhausted' } as const;
  const result = applyPreparationStatusToWeek(week, prep);
  expect(result.map(x => x.status)).toEqual(['blocked', 'ready', 'published', 'off_day', 'planned', 'blocked']);
  expect(result[0].detail).toContain('betalingsstatus'); expect(result[0].title).toBe('Saved title');
  expect(week).toEqual(before);
  expect(applyPreparationStatusToWeek(week, { ...prep, scope: 'reserve' })).toBe(week);
  expect(applyPreparationStatusToWeek(week, { ...prep, status: 'unavailable', reasonCode: 'status_unavailable' })[0].detail)
    .toContain('kunne ikke bekræftes');
});
it('does not call queued work active preparation', () => {
  expect(weeklyStory(day, emptyDeliveryState(), { topicHint: 'Gemt brief' }, {}))
    .toMatchObject({ status: 'planned', detail: 'Afventer næste forberedelseskørsel.' });
});
it('labels genuinely running work as preparing', () => {
  expect(weeklyStory(day, emptyDeliveryState(), { topicHint: 'Gemt brief' },
    { status: 'processing', processingStartedAt: new Date() }))
    .toMatchObject({ status: 'preparing', detail: 'Liv arbejder på historien.' });
});
it('shows a brief without pretending it is ready or starting generation', () => {
  expect(weeklyStory(day, emptyDeliveryState(), { topicHint: 'Tokyo Game Show' })).toMatchObject({
    title: 'Tokyo Game Show', status: 'planned', itemId: null,
  });
});
it('keeps a failed article visible, without leaking provider messages', () => {
  const result = weeklyStory(day, emptyDeliveryState(), { topicHint: 'Tokyo Game Show' },
    { status: 'failed', reason: 'research_dated_sources_insufficient', articleCheckpoint: { title: 'Saved' } });
  expect(result.status).toBe('blocked'); expect(result.title).toBe('Saved');
  expect(JSON.stringify(result)).not.toContain('research_dated');
});
it('names the actual alternate work instead of the displaced editorial plan', () => {
  expect(weeklyStory(day, emptyDeliveryState(), { topicHint: 'Original plan' },
    { topic: 'First attempt', status: 'failed' }, { topic: 'Actual alternative', status: 'failed' }))
    .toMatchObject({ title: 'Actual alternative', status: 'blocked' });
});
it('does not label unverified CMS work ready', () => {
  expect(weeklyStory(day, emptyDeliveryState(), undefined, { status: 'draft', webflowItemId: '123' }).status).toBe('blocked');
});
it('distinguishes missing plans and never invents content', () => {
  expect(weeklyStory(day, emptyDeliveryState())).toMatchObject({ status: 'unplanned', title: 'Emne vælges af Liv' });
});
it('uses a verified published slot over old preparation failures', () => {
  const state = emptyDeliveryState();
  state.slots[day] = { itemId: 'book', state: 'published', token: 't', leaseUntil: 0, attempts: 1, nextAttemptAt: 0 };
  expect(weeklyStory(day, state, { topicHint: 'Boganmeldelse' }, { status: 'failed' }).status).toBe('published');
});
