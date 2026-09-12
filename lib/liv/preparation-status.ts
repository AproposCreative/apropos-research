import { getAdminDb } from '@/lib/firebase-admin';
import { LIV_DAILY_COLLECTION, livDailyDocId } from '@/lib/liv/daily-history-store';
import { addDays, copenhagenClock, type DeliveryState } from '@/lib/liv/delivery-policy';
import { preparationCandidates } from '@/lib/liv/rolling-plan';
import { canRetryUnstartedPreparation } from '@/lib/liv/preparation-retry';

const runStatuses = ['processing', 'published', 'draft', 'skipped_no_topic', 'skipped_factcheck',
  'skipped_moderation', 'skipped_tov', 'skipped_duplicate', 'failed'] as const;
type PreparationScope = 'prepare' | 'prepare-alternative';
export type LivNextPreparationStatus = {
  day: string | null;
  scope: PreparationScope | null;
  status: 'idle' | 'queued' | 'preparing' | 'blocked_saved_work' | 'reconciliation_required' | 'unavailable';
  runStatus: typeof runStatuses[number] | null;
  reasonCode: 'no_preparation_needed' | 'awaiting_preparation' | 'preparation_in_progress' |
    'saved_stage_ready' | 'retry_limit_reached' | 'operator_retry_required' | 'cms_reconciliation_required' |
    'source_evidence_required' | 'factcheck_required' | 'moderation_required' | 'editorial_review_required' |
    'budget_limit' | 'delivery_reconciliation_required' | 'cover_revision_in_progress' |
    'alternative_limit_reached' | 'status_unavailable';
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
  const empty = { day: null, scope: null, runStatus: null };
  if (state.coverRevision) return { ...empty, status: 'reconciliation_required', reasonCode: 'cover_revision_in_progress' };
  if (Object.values(state.slots).some(slot => slot.state === 'attempted')) {
    return { ...empty, status: 'reconciliation_required', reasonCode: 'delivery_reconciliation_required' };
  }
  const candidate = preparationCandidates(state, today)[0];
  if (!candidate) {
    const exhaustedDay = [today, addDays(today, 1)].find(day => !state.slots[day] &&
      state.entries.filter(entry => entry.kind === 'scheduled' && entry.scheduledDay === day && entry.decision === 'rejected').length >= 2 &&
      !state.entries.some(entry => entry.kind === 'scheduled' && entry.scheduledDay === day &&
        ['ready', 'selected', 'published'].includes(entry.state) && entry.decision !== 'rejected' && entry.expiresDay >= day));
    return exhaustedDay ? { day: exhaustedDay, scope: 'prepare-alternative', runStatus: null,
      status: 'blocked_saved_work', reasonCode: 'alternative_limit_reached' }
      : { ...empty, status: 'idle', reasonCode: 'no_preparation_needed' };
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
