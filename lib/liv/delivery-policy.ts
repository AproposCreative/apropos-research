import type { LivEditorialKind } from './editorial-kind';
/** Pure policy shared by preparation, delivery and status. All days are Danish calendar days. */
// Produce one next-day article, not a speculative week of paid inventory.
// Existing reserves remain eligible; no new reserve stock is required.
export const LIV_RESERVE_TARGET = 0;
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

export function publicationTime(day: string) {
  if (!validDay(day)) throw new Error('liv_delivery_invalid_day');
  const atEightUtc = new Date(`${day}T08:00:00Z`);
  return new Date(atEightUtc.getTime() + (10 - copenhagenClock(atEightUtc).hour) * 3_600_000).toISOString();
}

export type ReadyEntry = {
  itemId: string; slug: string; title: string; scheduledDay: string; expiresDay: string;
  kind: 'scheduled' | 'reserve'; state: 'ready' | 'selected' | 'published' | 'rejected';
  preparedAt: string; payloadHash: string; planHash?: string;
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
};
export type DeliveryState = { entries: ReadyEntry[]; slots: Record<string, DeliverySlot>;
  /** Staged editorial mutation, never a publish attempt. Retained until reconciled. */
  coverRevision?: { id: string; itemId: string; day: string };
  preparation?: { token: string; leaseUntil: number } };
export const emptyDeliveryState = (): DeliveryState => ({ entries: [], slots: {} });

/** A future scheduled story can never be pulled forward as a fallback. */
export function eligibleEntries(state: DeliveryState, day: string) {
  return state.entries.filter(e => e.state === 'ready' && e.decision !== 'rejected' && e.scheduledDay <= day && e.expiresDay >= day &&
    (e.kind === 'reserve' || e.scheduledDay === day))
    .sort((a, b) => Number(b.decision === 'approved') - Number(a.decision === 'approved') ||
      Number(a.kind === 'reserve') - Number(b.kind === 'reserve') ||
      a.expiresDay.localeCompare(b.expiresDay) || a.preparedAt.localeCompare(b.preparedAt));
}

export function deliveryHealth(state: DeliveryState, now = new Date()) {
  const { day, hour } = copenhagenClock(now);
  const slot = state.slots[day];
  const reserves = state.entries.filter(e => e.kind === 'reserve' && e.state === 'ready' && e.decision !== 'rejected' &&
    e.scheduledDay <= day && e.expiresDay >= day).length;
  const missingDays = Array.from({ length: LIV_PLAN_DAYS }, (_, i) => addDays(day, i + 1))
    .filter(d => !state.entries.some(e => e.state === 'ready' && e.decision !== 'rejected' && e.kind === 'scheduled' &&
      e.scheduledDay === d && e.expiresDay >= d));
  return { day, published: slot?.state === 'published', publicUrl: slot?.publicUrl ?? null,
    overdue: hour >= 10 && slot?.state !== 'published', reserves, reserveTarget: LIV_RESERVE_TARGET,
    missingDays, needsReconciliation: Object.values(state.slots).some(s => s.state === 'attempted') };
}
