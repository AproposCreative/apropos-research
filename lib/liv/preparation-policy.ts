/** Pure, shared recovery policy. Cron polls never spend retry allowances. */
export const PREPARATION_POLICY_VERSION = 1;
export type PreparationDecision = {
  action: 'start' | 'resume' | 'repair' | 'retry' | 'wait' | 'alternative' | 'blocked' | 'reconcile' | 'done';
  stage: 'research' | 'article' | 'cms';
  reasonCode: string;
  nextAttemptAt: number | null;
};
export function timestampMillis(value: any): number {
  try { return typeof value === 'number' ? value : value?.toMillis?.() ?? Date.parse(value); }
  catch { return NaN; }
}
export function decidePreparation(row?: Record<string, any>, now = Date.now()): PreparationDecision {
  const stage = row?.articleCheckpoint ? 'article' : 'research';
  const decision = (action: PreparationDecision['action'], reasonCode: string,
    nextAttemptAt: number | null = null): PreparationDecision => ({ action, stage, reasonCode, nextAttemptAt });
  if (!row) return decision('start', 'awaiting_preparation');
  if (!row.status && !row.articleCheckpoint && !row.articleCheckpointHash && !row.cmsSaveStarted && !row.webflowItemId && !row.preparationProof) return decision('start', 'awaiting_preparation');
  if (row.webflowItemId || row.preparationProof || row.cmsSaveStarted) {
    return { ...decision('reconcile', 'cms_reconciliation_required'), stage: 'cms' };
  }
  if (['draft', 'published'].includes(row.status)) return decision('done', 'already_done');
  if (typeof row.retryAuthorization === 'string') return decision('resume', 'saved_stage_ready');
  if (row.status === 'processing' && row.continuationReady === true && row.articleCheckpoint) return decision('resume', 'saved_stage_ready');
  const started = timestampMillis(row.processingStartedAt);
  if (row.status === 'processing') {
    if (Number.isFinite(started) && now < started + 25 * 60_000) {
      return decision('wait', 'preparation_in_progress', started + 25 * 60_000);
    }
    // An interrupted call has an unknown outcome. Never buy that operation again.
    return decision('alternative', 'provider_result_unconfirmed');
  }
  const reason = typeof row.reason === 'string' ? row.reason.split(':', 1)[0].trim() : '';
  if (/^liv_cost_/.test(reason)) return decision('blocked', 'budget_limit');
  if (/http_(401|403)$|authentication|configuration_missing/.test(reason)) return decision('blocked', 'authentication_required');
  const recovery = row.recovery?.version === PREPARATION_POLICY_VERSION ? row.recovery : {};
  if (row.articleCheckpoint && (reason === 'liv_preparation_structure_failed' || row.status === 'skipped_factcheck') &&
      Number(row.articleCheckpoint.factRevisionCount ?? (row.articleCheckpoint.factRevisionId ? 1 : 0)) < 2 &&
      Number(recovery.repairs ?? 0) < 2) return decision('repair', 'article_correction_required');
  // Retry only errors known to precede writing. Unknown provider failures are not safe retries.
  if (/^liv_trending_(http_(429|5\d\d)|unavailable)$/.test(reason)) {
    const retries = Number(recovery.retries ?? 0);
    if (retries < 2) {
      const finished = timestampMillis(row.completedAt ?? row.updatedAt);
      const at = Number.isFinite(finished) ? finished + (retries ? 15 : 5) * 60_000 : now + 5 * 60_000;
      return decision(at > now ? 'wait' : 'retry', 'source_retry_scheduled', at);
    }
  }
  return decision('alternative', row.status === 'skipped_no_topic' ? 'no_topic' : 'candidate_exhausted');
}

export const executablePreparation = (d: PreparationDecision) =>
  ['start', 'resume', 'repair', 'retry'].includes(d.action);

/** Stored on the job, not reset by a new deployment. Legacy evidence is retained. */
export function claimedRecovery(row: Record<string, any> | undefined, d: PreparationDecision, now = Date.now()) {
  const prior = row?.recovery?.version === PREPARATION_POLICY_VERSION ? row.recovery : {};
  return { ...prior, version: PREPARATION_POLICY_VERSION,
    migratedAt: prior.migratedAt ?? new Date(now).toISOString(),
    legacyAttempts: prior.legacyAttempts ?? row?.preparationAttempts ?? 0,
    legacyReason: prior.legacyReason ?? (typeof row?.reason === 'string' ? row.reason.slice(0, 1000) : null),
    repairs: Number(prior.repairs ?? 0) + Number(d.action === 'repair'),
    retries: Number(prior.retries ?? 0) + Number(d.action === 'retry'),
    stage: d.stage, nextAction: d.action, nextAttemptAt: null };
}
