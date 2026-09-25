import { expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
import { weeklyStory } from '@/lib/liv/weekly-plan';
import { emptyDeliveryState } from '@/lib/liv/delivery-policy';
const day = '2026-09-26';
it('shows a brief without pretending it is ready or starting generation', () => {
  expect(weeklyStory(day, emptyDeliveryState(), { topicHint: 'Tokyo Game Show' })).toMatchObject({
    title: 'Tokyo Game Show', status: 'planned', itemId: null,
  });
});
it('keeps a failed article visible, without leaking provider messages', () => {
  const result = weeklyStory(day, emptyDeliveryState(), { topicHint: 'Tokyo Game Show' },
    { status: 'failed', reason: 'research_dated_sources_insufficient', articleCheckpoint: { title: 'Saved' } });
  expect(result.status).toBe('blocked'); expect(result.title).toBe('Tokyo Game Show');
  expect(JSON.stringify(result)).not.toContain('research_dated');
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
