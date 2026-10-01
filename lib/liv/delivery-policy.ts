import type { LivEditorialKind } from './editorial-kind';
/** Pure policy shared by preparation, delivery and status. All days are Danish calendar days. */
// Produce one next-publication article, not a speculative week of paid inventory.
// One durable reserve, replenished only after use/expiry. Explicit false is an operational off switch.
export const LIV_RESERVE_TARGET = 1;
export function reserveTarget() { return process.env.LIV_RESERVE_ENABLED === 'false' ? 0 : LIV_RESERVE_TARGET; }
export const LIV_PLAN_DAYS = 1;
export const LIV_DELIVERY_LEASE_MS = 6 * 60_000;

export function copenhagenClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return { day: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')) };
}

export function validDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T12:00:00Z`)) &&
    new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;
}

export function addDays(day: string, amount: number) {
  if (!validDay(day)) throw new Error('liv_delivery_invalid_day');
  return new Date(Date.parse(`${day}T12:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
}

// Owner changed cadence on 1 October. Preserve historical daily receipts and
// use calendar days (not elapsed 48h or day-of-month parity) across DST/months.
export const LIV_CADENCE_EFFECTIVE_DAY = '2026-10-01';
export const LIV_CADENCE_ANCHOR_DAY = '2026-10-02';
export const LIV_PUBLICATION_INTERVAL_DAYS = 2;
export function isPublicationDay(day: string) {
  if (!validDay(day)) throw new Error('liv_delivery_invalid_day');
  if (day < LIV_CADENCE_EFFECTIVE_DAY) return true;
  const days = (Date.parse(`${day}T12:00:00Z`) - Date.parse(`${LIV_CADENCE_ANCHOR_DAY}T12:00:00Z`)) / 86_400_000;
  return days >= 0 && days % LIV_PUBLICATION_INTERVAL_DAYS === 0;
}
export function nextPublicationDay(day: string, inclusive = false) {
  let next = inclusive ? day : addDays(day, 1);
  while (!isPublicationDay(next)) next = addDays(next, 1);
  return next;
}

export function publicationTime(day: string) {
  if (!validDay(day)) throw new Error('liv_delivery_invalid_day');
  const atEightUtc = new Date(`${day}T08:00:00Z`);
  return new Date(atEightUtc.getTime() + (10 - copenhagenClock(atEightUtc).hour) * 3_600_000).toISOString();
}

export type ReadyEntry = {
  itemId: string; slug: string; title: string; scheduledDay: string; expiresDay: string;
  kind: 'scheduled' | 'reserve'; state: 'ready' | 'selected' | 'published' | 'rejected';
  preparedAt: string; payloadHash: string; planHash?: string;
  /** Failed current CMS checks; original preparation evidence remains immutable. */
  publicationBlockers?: string[];
  /** Presentation only; never changes the immutable CMS payload or its proof. */
  editorialKind?: LivEditorialKind;
  decision?: 'approved' | 'rejected'; decisionRevision?: number;
  decidedAt?: string; decidedBy?: string;
  /** Private author-owned projection; immutable feedback audit is stored separately. */
  editorialFeedback?: { text: string; userId: string; recordedAt: string; revision: number };
};
export type DeliverySlot = {
  itemId: string; token: string; state: 'selected' | 'attempted' | 'published';
  leaseUntil: number; attempts: number; nextAttemptAt: number; fieldDataHash?: string;
  publicUrl?: string; checkedAt?: string;
  explicitPublication?: { requestId: string; itemId: string; expectedPayloadHash: string; reason: string; requestedAt: string };
};
export type ExplicitLivPublication = { requestId: string; itemId: string; expectedPayloadHash: string; reason: string };
export type DeliveryState = { entries: ReadyEntry[]; slots: Record<string, DeliverySlot>;
  /** Explicit bounded batch dates, not a rolling inventory target. */
  editorialPreparationDays?: string[];
  /** Durable automatic reserve identity. Never replaced merely because a day changed. */
  reservePreparation?: { dayKey: string };
  /** Staged editorial mutation, never a publish attempt. Retained until reconciled. */
  coverRevision?: { id: string; itemId: string; day: string };
  preparation?: { token: string; leaseUntil: number } };
export const emptyDeliveryState = (): DeliveryState => ({ entries: [], slots: {} });

export function scheduledPreparationDays(_state: DeliveryState, today: string) {
  // Future briefs remain saved and visible, but do not buy a speculative week.
  // Existing ready inventory is untouched; its normal delivery dates still apply.
  return isPublicationDay(today) ? [today, nextPublicationDay(today)] : [nextPublicationDay(today)];
}

/** A future scheduled story can never be pulled forward as a fallback. */
export function eligibleEntries(state: DeliveryState, day: string) {
  return state.entries.filter(e => e.state === 'ready' && !e.publicationBlockers?.length && e.decision !== 'rejected' && e.scheduledDay <= day && e.expiresDay >= day &&
    (e.kind === 'reserve' || e.scheduledDay === day))
    .sort((a, b) => Number(b.decision === 'approved') - Number(a.decision === 'approved') ||
      Number(a.kind === 'reserve') - Number(b.kind === 'reserve') ||
      a.expiresDay.localeCompare(b.expiresDay) || a.preparedAt.localeCompare(b.preparedAt));
}

export function deliveryHealth(state: DeliveryState, now = new Date()) {
  const { day, hour } = copenhagenClock(now);
  const slot = state.slots[day];
  const reserves = state.entries.filter(e => e.kind === 'reserve' && e.state === 'ready' && !e.publicationBlockers?.length && e.decision !== 'rejected' &&
    e.scheduledDay <= day && e.expiresDay >= day).length;
  const missingDays = [nextPublicationDay(day)]
    .filter(d => !state.entries.some(e => e.state === 'ready' && !e.publicationBlockers?.length && e.decision !== 'rejected' && e.kind === 'scheduled' &&
      e.scheduledDay === d && e.expiresDay >= d));
  const blockedItems = state.entries.filter(e => e.state === 'ready' && e.publicationBlockers?.length).map(e => e.itemId);
  return { blockedItems, day, publicationDay: isPublicationDay(day),
    publicationIntervalDays: day < LIV_CADENCE_EFFECTIVE_DAY ? 1 : LIV_PUBLICATION_INTERVAL_DAYS,
    published: slot?.state === 'published', publicUrl: slot?.publicUrl ?? null,
    overdue: isPublicationDay(day) && hour >= 10 && slot?.state !== 'published', reserves, reserveTarget: reserveTarget(),
    missingDays, needsReconciliation: Object.values(state.slots).some(s => s.state === 'attempted') };
}
