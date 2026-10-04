import { z } from 'zod';
import { shorteningProposalInput, shorteningEdits } from './shortening-contract';
import { buildLivShorteningCandidate } from './shortening-candidate';
import { cmsFieldHash as hash } from './cms-field-hash';
import type { GeneratedArticle } from './generate-article';

const source = z.object({ kind: z.literal('chatgpt-supplied'), actorUid: z.string().min(1).max(128),
  modelVerified: z.literal(false) }).strict();

/** Validate both origins without fabricating an API finish reason or model
 * verdict for externally supplied text. Both still require human review. */
export function readLivShorteningRecord(row: Record<string, any> | undefined, actorUid: string) {
  if (!row?.article || !row.proposal || row.status !== 'preview') throw Error('liv_shortening_review_not_ready');
  const input = shorteningProposalInput.parse(row.input);
  if (row.inputHash !== hash({ input, article: row.article })) throw Error('liv_shortening_candidate_changed');
  let edits;
  if (row.candidateSource !== undefined) {
    const origin = source.parse(row.candidateSource);
    if (origin.actorUid !== actorUid || row.rawResponse !== undefined || row.finishReason !== undefined ||
      row.refusal !== undefined || row.model !== undefined || row.providerAttempted !== false)
      throw Error('liv_shortening_candidate_changed');
    edits = shorteningEdits.parse(row.edits);
    if (row.submissionHash !== hash({ input, edits, actorUid })) throw Error('liv_shortening_candidate_changed');
  } else {
    if (row.finishReason !== 'stop' || row.refusal !== false || typeof row.rawResponse !== 'string')
      throw Error('liv_shortening_review_not_ready');
    try { edits = shorteningEdits.parse(JSON.parse(row.rawResponse)); }
    catch { throw Error('liv_shortening_candidate_invalid'); }
  }
  const article = row.article as GeneratedArticle;
  const candidate = buildLivShorteningCandidate(article, input.targetWords, edits);
  const candidateHash = hash({ content: candidate.content });
  if (row.proposal.content !== candidate.content || row.proposal.candidateHash !== candidateHash)
    throw Error('liv_shortening_candidate_changed');
  return { input, article, edits, candidate, candidateHash };
}
