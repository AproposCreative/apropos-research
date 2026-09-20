import { addDays, copenhagenClock, eligibleEntries, type DeliveryState } from './delivery-policy';
import { decidePreparation, type PreparationDecision } from './preparation-policy';

export type ScheduledPreparationScope = 'prepare' | 'prepare-alternative';
export type ScheduledPreparation = { dayKey: string; kind: 'scheduled'; scope: ScheduledPreparationScope;
  row?: Record<string, any>; decision: PreparationDecision };

/** Same read-only selection for worker and UI. At most two identities per day. */
export async function nextScheduledPreparation(state: DeliveryState,
  read: (day: string, scope: ScheduledPreparationScope) => Promise<Record<string, any> | undefined>, now = new Date()) {
  if (state.coverRevision || Object.values(state.slots).some(s => s.state === 'attempted')) return null;
  const clock = copenhagenClock(now);
  let blocked: ScheduledPreparation | null = null;
  for (const dayKey of [clock.day, addDays(clock.day, 1)]) {
    if (dayKey === clock.day && clock.hour >= 20 || state.slots[dayKey] || eligibleEntries(state, dayKey).length) continue;
    const rejected = state.entries.filter(e => e.kind === 'scheduled' && e.scheduledDay === dayKey &&
      (e.decision === 'rejected' || e.state === 'rejected'));
    const primary = await read(dayKey, 'prepare');
    const held = state.entries.find(e => e.kind === 'scheduled' && e.scheduledDay === dayKey &&
      e.state === 'ready' && e.decision !== 'rejected' && e.publicationBlockers?.length);
    if (held) return { dayKey, kind: 'scheduled' as const, scope: 'prepare' as const,
      row: primary ?? { webflowItemId: held.itemId },
      decision: { action: 'reconcile' as const, stage: 'cms' as const,
        reasonCode: 'cms_reconciliation_required', nextAttemptAt: null } };
    let scope: ScheduledPreparationScope = 'prepare';
    let row = primary;
    let decision = decidePreparation(primary, now.getTime());
    if (rejected.length || decision.action === 'alternative') {
      scope = 'prepare-alternative';
      row = await read(dayKey, scope);
      decision = rejected.length >= 2
        ? { action: 'blocked', stage: 'article', reasonCode: 'alternative_limit_reached', nextAttemptAt: null }
        : decidePreparation(row, now.getTime());
      if (decision.action === 'alternative') decision = { ...decision, action: 'blocked', reasonCode: 'alternative_limit_reached' };
    }
    const candidate: ScheduledPreparation = { dayKey, kind: 'scheduled', scope, row, decision };
    if (decision.action === 'done') continue;
    if (decision.action === 'blocked' && decision.reasonCode !== 'budget_limit') {
      blocked ??= candidate;
      continue;
    }
    return candidate;
  }
  return blocked;
}
