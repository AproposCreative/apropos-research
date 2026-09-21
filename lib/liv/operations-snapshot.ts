import { addDays, deliveryHealth, eligibleEntries, type DeliveryState } from './delivery-policy';
import type { LivNextPreparationStatus } from './preparation-status';

/** Same delivery policy as the worker; a toggle or CMS draft is never a live receipt. */
export function livOperationsSnapshot(state: DeliveryState, preparation: LivNextPreparationStatus, now = new Date()) {
  const health = deliveryHealth(state, now), slot = state.slots[health.day];
  const nextDay = health.published ? addDays(health.day, 1) : health.day;
  const selected = state.slots[nextDay];
  const next = selected ? state.entries.find(e => e.itemId === selected.itemId) : eligibleEntries(state, nextDay)[0];
  const today = slot ? state.entries.find(e => e.itemId === slot.itemId) : undefined;
  const url = slot?.publicUrl;
  const verified = slot?.state === 'published' && typeof url === 'string' &&
    /^https:\/\/www\.aproposmagazine\.com\/articles\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url) &&
    typeof slot.checkedAt === 'string' && Number.isFinite(Date.parse(slot.checkedAt)) && Date.parse(slot.checkedAt) <= now.getTime();
  return { ...health, nextDay, nextStory: next ? { title: next.title, state: next.state } : null,
    today: { status: verified ? 'verified_live' as const : health.published ? 'recorded_unverified' as const :
      health.overdue ? 'missing' as const : 'scheduled' as const, title: today?.title ?? null,
      publicUrl: verified ? url : null, verifiedAt: verified ? slot.checkedAt! : null }, preparation,
    autoPublishEnabled: process.env.LIV_DELIVERY_QUEUE_ENABLED === 'true' &&
      process.env.LIV_DAILY_PUBLICATION_MODE === 'auto_publish' &&
      !['1', 'true'].includes((process.env.LIV_DAILY_PAUSED || '').toLowerCase()) };
}
