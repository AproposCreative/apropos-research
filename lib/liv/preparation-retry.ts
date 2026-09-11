/** Only pre-generation failures can be retried automatically, at most 3 claims. */
export function canRetryUnstartedPreparation(row: Record<string, unknown> | undefined): boolean {
  if (!row || row.webflowItemId || row.articleCheckpoint || row.articleCheckpointHash || row.preparationProof) return false;
  const attempts = row.preparationAttempts ?? 0;
  if (typeof attempts !== 'number' || !Number.isInteger(attempts) || attempts < 0 || attempts >= 3) return false;
  // Legacy no-topic results were recorded before generation (including masked 401s).
  return row.status === 'skipped_no_topic' ||
    (row.status === 'failed' && typeof row.reason === 'string' &&
      /^liv_trending_(http_\d{3}|invalid_response|unavailable)$/.test(row.reason));
}
