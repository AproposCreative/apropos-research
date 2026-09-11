/** Unstarted preparation failures can be retried automatically, at most 3 claims.
 * Research/model failures are transient often enough that permanently retaining
 * them would strand the rolling queue after one bad provider response. */
export function canRetryUnstartedPreparation(row: Record<string, unknown> | undefined): boolean {
  if (!row || row.webflowItemId || row.articleCheckpoint || row.articleCheckpointHash || row.preparationProof) return false;
  const attempts = row.preparationAttempts ?? 0;
  if (typeof attempts !== 'number' || !Number.isInteger(attempts) || attempts < 0 || attempts >= 3) return false;
  return row.status === 'skipped_no_topic' || row.status === 'failed';
}
