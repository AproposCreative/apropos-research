import { decidePreparation, preparationBlocksNewWork } from './preparation-policy';

/** Legacy pre-writing retries remain bounded. Dependency/uncertain outcomes
 * never grant a retry merely because no article checkpoint was returned. */
export function canRetryUnstartedPreparation(row: Record<string, unknown> | undefined): boolean {
  if (!row || hasSavedPreparation(row)) return false;
  if (preparationBlocksNewWork(decidePreparation(row))) return false;
  const attempts = row.preparationAttempts ?? 0;
  if (typeof attempts !== 'number' || !Number.isInteger(attempts) || attempts < 0 || attempts >= 3) return false;
  if (row.resumeWritingRunId || row.rawResponse || row.researchRunId) return false;
  if (row.status === 'skipped_no_topic') return true;
  const reason = typeof row.reason === 'string' ? row.reason.split(':', 1)[0].trim() : '';
  // A rejected writer response can exist in the immutable source archive before
  // articleCheckpoint is created. Absence of that checkpoint is NOT evidence
  // that no paid work occurred. Only known pre-writing failures may retry here.
  return row.status === 'failed' && (reason === 'research_sources_unavailable' ||
    /^liv_trending_(?:http_(?:429|5\d\d)|invalid_response|unavailable)$/.test(reason));
}

function hasSavedPreparation(row: Record<string, unknown>): boolean {
  return !!(row.webflowItemId || row.articleCheckpoint || row.articleCheckpointHash || row.preparationProof || row.cmsSaveStarted);
}

/** Topic eligibility is separate from permission to retry a particular run.
 * Exhausted runs stay terminal, but a pre-writing source failure should not
 * consume that subject forever. Keep a six-hour cooldown to avoid hot loops.
 * The history store must pass the original row, including completedAt.
 */
export function shouldExcludeLivTopic(row: Record<string, unknown> | undefined, now = Date.now()): boolean {
  if (!row) return false;
  if (hasSavedPreparation(row)) return true;
  const reason = typeof row.reason === 'string' ? row.reason.split(':', 1)[0].trim() : '';
  const preWritingFailure = row.status === 'skipped_no_topic' || (row.status === 'failed' && (
    reason === 'research_sources_unavailable' ||
    /^liv_trending_(?:http_\d{3}|invalid_response|unavailable)$/.test(reason)
  ));
  if (!preWritingFailure || !Number.isFinite(now)) return true;

  const completedAt = row.completedAt;
  let completed: number;
  try {
    completed = completedAt instanceof Date ? completedAt.getTime()
      : typeof completedAt === 'object' && completedAt !== null &&
        'toMillis' in completedAt && typeof completedAt.toMillis === 'function'
        ? completedAt.toMillis() : NaN;
  } catch { return true; }
  return !Number.isFinite(completed) || now - completed < 6 * 60 * 60 * 1000;
}
