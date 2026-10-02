import { getAdminDb } from '@/lib/firebase-admin';
import { LIV_DAILY_PLAN_COLLECTION } from './daily-plan-store';
import { LIV_DAILY_COLLECTION, livDailyDocId } from './daily-history-store';
import { addDays, isPublicationDay, copenhagenClock, type DeliveryState } from './delivery-policy';
import { decidePreparation } from './preparation-policy';
import type { LivNextPreparationStatus } from './preparation-status';

export type WeeklyStory = {
  day: string; title: string; itemId: string | null;
  status: 'off_day' | 'unplanned' | 'planned' | 'preparing' | 'blocked' | 'ready' | 'published';
  detail: string;
};
const text = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 240) : '';

/** Presentation only. A saved brief is not a completed article or publish grant. */
export function weeklyStory(day: string, state: DeliveryState, plan?: Record<string, any>,
  primary?: Record<string, any>, alternative?: Record<string, any>, now = Date.now()): WeeklyStory {
  const slot = state.slots[day];
  const entry = slot ? state.entries.find(e => e.itemId === slot.itemId) : state.entries.find(e =>
    e.kind === 'scheduled' && e.scheduledDay === day && e.expiresDay >= day && e.decision !== 'rejected' && e.state !== 'rejected');
  const row = alternative ?? primary;
  const title = text(entry?.title) || text(row?.articleCheckpoint?.title) ||
    text(row?.topic?.title) || text(row?.topic) || text(plan?.topicHint) || 'Emne vælges af Liv';
  const base = { day, title, itemId: entry?.itemId ?? slot?.itemId ?? null };
  if (slot?.state === 'published') return { ...base, status: 'published', detail: 'Udgivelsen er bekræftet.' };
  if (slot?.state === 'attempted' || entry?.publicationBlockers?.length) {
    return { ...base, status: 'blocked', detail: 'Gemte CMS-data skal afstemmes før udgivelse.' };
  }
  if (!isPublicationDay(day)) return { day, title: 'Ingen automatisk udgivelse', itemId: null,
    status: 'off_day', detail: 'Liv udkommer hver anden dag. Eventuelt gemt arbejde er bevaret.' };
  if (entry && ['ready', 'selected'].includes(entry.state)) return { ...base, status: 'ready', detail: 'Tekst, billeder og CMS-kladden er klar.' };
  if (row) {
    const decision = decidePreparation(row, now);
    if (['blocked', 'alternative', 'reconcile', 'done'].includes(decision.action)) {
      const source = ['research_dated_sources_insufficient', 'article_evidence_insufficient', 'research_sources_unavailable'].includes(row.reason);
      return { ...base, status: 'blocked', detail: source ? 'Mangler tilstrækkeligt kildegrundlag. Gemt arbejde er bevaret.' :
        'Forberedelsen er stoppet. Gemt arbejde er bevaret; historien er ikke udgivelsesklar.' };
    }
    const active = decision.action === 'wait' && decision.reasonCode === 'preparation_in_progress';
    return { ...base, status: active ? 'preparing' : 'planned',
      detail: active ? 'Liv arbejder på historien.' : 'Afventer næste forberedelseskørsel.' };
  }
  return { ...base, status: plan ? 'planned' : 'unplanned', detail: plan ?
    'Brief gemt. Tekst og billeder er ikke færdige.' : 'Ingen historie planlagt endnu.' };
}

/** Reuse the effective next-job status; never hide completed or off-day rows. */
export function applyPreparationStatusToWeek(week: WeeklyStory[], preparation?: LivNextPreparationStatus): WeeklyStory[] {
  if (!preparation || preparation.scope === 'reserve' ||
    !['blocked_saved_work', 'unavailable'].includes(preparation.status)) return week;
  return week.map(story => story.day === preparation.day && ['planned', 'preparing', 'unplanned'].includes(story.status)
    ? { ...story, status: 'blocked', detail: preparation.reasonCode === 'provider_quota_exhausted'
      ? 'AI-forberedelsen er blokeret af udbyderens betalingsstatus. Gemt arbejde er bevaret.'
      : preparation.status === 'unavailable' ? 'Forberedelsesstatus kunne ikke bekræftes. Gemt arbejde er bevaret.'
      : 'Forberedelsen er stoppet. Gemt arbejde er bevaret; historien er ikke udgivelsesklar.' }
    : story);
}

/** One bounded Firestore batch, zero model/research/CMS calls or writes. */
export async function readWeeklyPlan(state: DeliveryState, now = new Date(), preparation?: LivNextPreparationStatus): Promise<WeeklyStory[]> {
  const db = getAdminDb(); if (!db) throw new Error('liv_week_unavailable');
  const days = Array.from({ length: 7 }, (_, i) => addDays(copenhagenClock(now).day, i));
  const refs = days.flatMap(day => [db.collection(LIV_DAILY_PLAN_COLLECTION).doc(`plan-${day}`),
    db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(day, 'prepare')),
    db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(day, 'prepare-alternative'))]);
  const snaps = await db.getAll(...refs);
  return applyPreparationStatusToWeek(days.map((day, i) => weeklyStory(day, state, snaps[i * 3].data(),
    snaps[i * 3 + 1].data(), snaps[i * 3 + 2].data(), now.getTime())), preparation);
}
