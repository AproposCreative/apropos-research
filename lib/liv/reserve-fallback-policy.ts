import type { ScheduledPreparation } from './next-preparation';

/** A separate, single durable reserve may progress after exhausted content
 * candidates. Never treat quota, unknown provider results or CMS work as an
 * excuse to buy another generation. This does not reopen either failed job. */
export function canPrepareReserveFallback(candidate: ScheduledPreparation | null | undefined) {
  if (!candidate || candidate.decision.action !== 'blocked' ||
      candidate.decision.reasonCode !== 'alternative_limit_reached') return false;
  const row = candidate.row;
  if (!row || row.cmsSaveStarted || row.webflowItemId || row.preparationProof) return false;
  return ['research_dated_sources_insufficient', 'research_sources_unavailable',
    'article_evidence_insufficient', 'source_similarity_incomplete', 'source_similarity_unapproved']
    .includes(typeof row.reason === 'string' ? row.reason.split(':', 1)[0] : '');
}
