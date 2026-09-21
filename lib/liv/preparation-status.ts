import { getAdminDb } from '@/lib/firebase-admin';
import { LIV_DAILY_COLLECTION, livDailyDocId } from '@/lib/liv/daily-history-store';
import { copenhagenClock, scheduledPreparationDays, type DeliveryState } from '@/lib/liv/delivery-policy';
import { canRetryUnstartedPreparation } from '@/lib/liv/preparation-retry';
import { reserveNeeded } from './reserve-preparation';
import { decidePreparation, type PreparationDecision } from './preparation-policy';
import { nextScheduledPreparation } from './next-preparation';

const runStatuses = ['processing', 'published', 'draft', 'skipped_no_topic', 'skipped_factcheck',
  'skipped_moderation', 'skipped_tov', 'skipped_duplicate', 'failed'] as const;
type PreparationScope = 'prepare' | 'prepare-alternative' | 'reserve';
export type LivNextPreparationStatus = {
  day: string | null;
  scope: PreparationScope | null;
  status: 'idle' | 'queued' | 'preparing' | 'blocked_saved_work' | 'reconciliation_required' | 'unavailable';
  runStatus: typeof runStatuses[number] | null;
  stage?: PreparationDecision['stage'];
  nextAction?: PreparationDecision['action'];
  nextAttemptAt?: string | null;
  reasonCode: 'no_preparation_needed' | 'awaiting_preparation' | 'preparation_in_progress' |
    'saved_stage_ready' | 'retry_limit_reached' | 'operator_retry_required' | 'cms_reconciliation_required' |
    'source_evidence_required' | 'factcheck_required' | 'moderation_required' | 'editorial_review_required' |
    'budget_limit' | 'delivery_reconciliation_required' | 'cover_revision_in_progress' |
    'alternative_limit_reached' | 'status_unavailable' | 'article_correction_required' | 'provider_quota_exhausted' | 'provider_unavailable' |
    'source_retry_scheduled' | 'provider_result_unconfirmed' | 'no_topic' | 'candidate_exhausted' | 'already_done' | 'authentication_required';
};

/** The existing cron eligibility expression, not a new retry authorization. */
export function canResumeLivPreparationCheckpoint(row: Record<string, any> | undefined): boolean {
  return !!row && (row.continuationReady === true && !!row.articleCheckpoint ||
    typeof row.retryAuthorization === 'string' || Number(row.preparationAttempts ?? 0) <= 4 &&
    Array.isArray(row.articleCheckpoint?.preparedMedia) && row.articleCheckpoint.preparedMedia.length >= 3 &&
    !row.webflowItemId && !row.preparationProof) && !row.cmsSaveStarted;
}

/** Closed projection: never forward a persisted reason/message, even if it
 * resembles an error code. Provider strings can contain URLs or credentials. */
export function livPreparationStatusForRow(day: string, scope: PreparationScope,
  row?: Record<string, any>, now = Date.now()): LivNextPreparationStatus {
  const runStatus = runStatuses.includes(row?.status) ? row!.status as LivNextPreparationStatus['runStatus'] : null;
  const base = { day, scope, runStatus };
  if (scope === 'prepare' || scope === 'prepare-alternative') {
    const d = decidePreparation(row, now);
    return { ...base, stage: d.stage, nextAction: d.action,
      nextAttemptAt: d.nextAttemptAt ? new Date(d.nextAttemptAt).toISOString() : null,
      status: d.action === 'wait' ? 'preparing' : ['blocked', 'alternative', 'reconcile'].includes(d.action)
        ? 'blocked_saved_work' : d.action === 'done' ? 'idle' : 'queued',
      reasonCode: d.reasonCode as LivNextPreparationStatus['reasonCode'] };
  }
  if (!row) return { ...base, status: 'queued', reasonCode: 'awaiting_preparation' };
  if (row.webflowItemId || row.preparationProof || row.cmsSaveStarted) {
    return { ...base, status: 'blocked_saved_work', reasonCode: 'cms_reconciliation_required' };
  }
  if (canResumeLivPreparationCheckpoint(row) || canRetryUnstartedPreparation(row)) {
    return { ...base, status: 'queued', reasonCode: 'saved_stage_ready' };
  }
  let started = NaN;
  try { started = row.processingStartedAt?.toMillis?.() ?? NaN; } catch { /* Unknown timestamp is not an active lease. */ }
  if (runStatus === 'processing' && Number.isFinite(started) && started <= now && now - started < 25 * 60_000) {
    return { ...base, status: 'preparing', reasonCode: 'preparation_in_progress' };
  }
  const prefix = typeof row.reason === 'string' ? row.reason.split(':', 1)[0] : '';
  let reasonCode: LivNextPreparationStatus['reasonCode'] = 'operator_retry_required';
  if (['liv_cost_monthly_budget_exceeded', 'liv_cost_call_limit_exceeded', 'liv_cost_context_blocked'].includes(prefix)) reasonCode = 'budget_limit';
  else if (['research_sources_unavailable', 'research_dated_sources_insufficient'].includes(prefix)) reasonCode = 'source_evidence_required';
  else if (runStatus === 'skipped_factcheck') reasonCode = 'factcheck_required';
  else if (runStatus === 'skipped_moderation') reasonCode = 'moderation_required';
  else if (runStatus === 'skipped_tov') reasonCode = 'editorial_review_required';
  else if (Number.isInteger(row.preparationAttempts) && row.preparationAttempts >=
      (row.articleCheckpoint ? 5 : 3)) reasonCode = 'retry_limit_reached';
  return { ...base, status: 'blocked_saved_work', reasonCode };
}

/** Read-only DTO for authenticated UI/API callers. Authenticate before calling;
 * pass the already-read manifest. Only the candidate's saved row is read; its
 * content is projected away. No CMS/source retrieval or cost-history lookup.
 * This helper never claims, retries or generates work. */
export async function readNextLivPreparationStatus(state: DeliveryState, now = new Date()): Promise<LivNextPreparationStatus> {
  const today = copenhagenClock(now).day;
  const days = scheduledPreparationDays(state, today);
  const empty = { day: null, scope: null, runStatus: null };
  if (state.coverRevision) return { ...empty, status: 'reconciliation_required', reasonCode: 'cover_revision_in_progress' };
  if (Object.values(state.slots).some(slot => slot.state === 'attempted')) {
    return { ...empty, status: 'reconciliation_required', reasonCode: 'delivery_reconciliation_required' };
  }
  // Saved inventory can be ready structurally but blocked by a later CMS check.
  // Surface that work instead of claiming idle or regenerating a paid article.
  const blocked = state.entries.find(entry => entry.kind === 'scheduled' &&
    days.includes(entry.scheduledDay) && !state.slots[entry.scheduledDay] &&
    entry.state === 'ready' && entry.decision !== 'rejected' && entry.expiresDay >= entry.scheduledDay && entry.publicationBlockers?.length &&
    !state.entries.some(other => other.kind === 'scheduled' && other.scheduledDay === entry.scheduledDay &&
      other.state === 'ready' && other.decision !== 'rejected' && !other.publicationBlockers?.length && other.expiresDay >= entry.scheduledDay));
  if (blocked) return { day: blocked.scheduledDay, scope: 'prepare', runStatus: null,
    status: 'blocked_saved_work', reasonCode: 'cms_reconciliation_required' };
  let scheduled;
  try {
    const db = getAdminDb();
    if (!db) throw new Error('unavailable');
    scheduled = await nextScheduledPreparation(state, async (day, scope) =>
      (await db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(day, scope)).get()).data(), now);
  } catch { return { ...empty, status: 'unavailable', reasonCode: 'status_unavailable' }; }
  if (scheduled) {
    const result = livPreparationStatusForRow(scheduled.dayKey, scheduled.scope, scheduled.row, now.getTime());
    return { ...result, nextAction: scheduled.decision.action,
      ...(scheduled.decision.action === 'blocked' ? { status: 'blocked_saved_work' as const,
        reasonCode: scheduled.decision.reasonCode as LivNextPreparationStatus['reasonCode'] } : {}) };
  }
  const candidate: { dayKey: string; scope?: PreparationScope } | undefined =
    (reserveNeeded(state,today) ? { dayKey: state.reservePreparation?.dayKey ?? today, scope: 'reserve' } : undefined);
  if (!candidate) {
    const exhaustedDay = days.find(day => !state.slots[day] &&
      state.entries.filter(entry => entry.kind === 'scheduled' && entry.scheduledDay === day && entry.decision === 'rejected').length >= 2 &&
      !state.entries.some(entry => entry.kind === 'scheduled' && entry.scheduledDay === day &&
        ['ready', 'selected', 'published'].includes(entry.state) && entry.decision !== 'rejected' && entry.expiresDay >= day));
    if (exhaustedDay) return { day: exhaustedDay, scope: 'prepare-alternative', runStatus: null,
      status: 'blocked_saved_work', reasonCode: 'alternative_limit_reached' };
    // A retained unusable reserve suppresses replenishment. That is not idle:
    // expose the hold without replacing its paid work or masking daily work.
    const reserves = state.entries.filter(e => e.kind === 'reserve' && e.expiresDay >= today && e.state !== 'published');
    const usableReserve = reserves.some(e => e.state === 'ready' && e.decision !== 'rejected' &&
      !e.publicationBlockers?.length && e.scheduledDay <= today);
    const heldReserve = !usableReserve && reserves.find(e => e.state === 'rejected' || e.decision === 'rejected' || e.publicationBlockers?.length);
    if (heldReserve) return { day: heldReserve.scheduledDay, scope: 'reserve', runStatus: null,
      status: 'blocked_saved_work', reasonCode: heldReserve.publicationBlockers?.length ? 'cms_reconciliation_required' : 'operator_retry_required' };
    return { ...empty, status: 'idle', reasonCode: 'no_preparation_needed' };
  }
  const scope = candidate.scope || 'prepare';
  try {
    const db = getAdminDb();
    if (!db) throw new Error('unavailable');
    const snap = await db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(candidate.dayKey, scope)).get();
    return livPreparationStatusForRow(candidate.dayKey, scope, snap.exists ? snap.data() : undefined, now.getTime());
  } catch {
    return { day: candidate.dayKey, scope, runStatus: null, status: 'unavailable', reasonCode: 'status_unavailable' };
  }
}
