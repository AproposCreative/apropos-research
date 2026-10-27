import { LIV_EDITORIAL_REMIT } from './editorial-remit';
import type { LivDailyPlan } from '@/lib/liv/daily-plan-store';
import { isPublicationDay, nextPublicationDay, eligibleEntries, type DeliveryState } from '@/lib/liv/delivery-policy';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';

export function editorialPlanHash(plan: LivDailyPlan | null) {
  return cmsFieldHash({ topicHint: plan?.topicHint || '', directiveHint: plan?.directiveHint || '',
    expandedDirective: plan?.expandedDirective || '', articleFormat: plan?.articleFormat || 'article',
    mustUseTrending: plan?.mustUseTrending ?? true });
}

// Rotate the cultural subject, never fabricate a current work or a researched title.
const REVIEW_SUBJECTS = ['koncert', 'tv-serie', 'bog', 'museum eller udstilling', 'film', 'kulturoplevelse'];
export function defaultEditorialPlan(day: string, reserve = false): LivDailyPlan {
  const index = Math.floor(Date.parse(`${day}T12:00:00Z`) / 86_400_000) % REVIEW_SUBJECTS.length;
  return { dayKey: day, directiveHint: LIV_EDITORIAL_REMIT.instruction +
    ` Prioritér denne gang en ${REVIEW_SUBJECTS[index]}. Vælg det konkrete værk efter kildekontrol og dubletkontrol.` +
    (reserve ? ' Reserve: vælg et værk eller en guide med holdbar relevans uden udløbne arrangementer.' : ' Kontrollér aktualitet til udgivelsesdatoen.'),
    mustUseTrending: false, status: 'pending', createdAt: null, updatedAt: null };
}

/** One article in production at a time. Keep old inventory and paid jobs intact.
 * An explicit rejection permits one alternative in a separate durable job, never
 * a reset of the rejected article or an unbounded stream of replacements. */
export function preparationCandidates(state: DeliveryState, today: string) {
  if (state.coverRevision || Object.values(state.slots).some(slot => slot.state === 'attempted')) return [];
  const dayKey = isPublicationDay(today) && !state.slots[today] && eligibleEntries(state, today).length === 0 ? today : nextPublicationDay(today);
  if (state.slots[dayKey] || state.entries.some(e => e.kind === 'scheduled' && e.scheduledDay === dayKey &&
      e.expiresDay >= dayKey && e.decision !== 'rejected' && ['ready', 'selected', 'published'].includes(e.state))) return [];
  const rejected = state.entries.filter(e => e.kind === 'scheduled' && e.scheduledDay === dayKey &&
    e.decision === 'rejected');
  if (rejected.length >= 2) return [];
  return [{ dayKey, kind: 'scheduled' as const,
    ...(rejected.length ? { scope: 'prepare-alternative' as const } : {}) }];
}
