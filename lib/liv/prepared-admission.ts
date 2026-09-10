import type { WebflowArticleFields } from '@/lib/webflow/types';
import { inspectLivCmsDraft } from '@/lib/liv/cms-readback';
import { enqueueReadyArticle } from '@/lib/liv/delivery-store';
import type { ReadyEntry } from '@/lib/liv/delivery-policy';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';

export type PreparationProof = {
  expected: WebflowArticleFields; hash: string; editorialPassed: true; structurePassed: true; planHash?: string;
};
/** Reusable admission for initial saves and recovery of a known, already-paid CMS draft. */
export async function admitPreparedArticle(entry: Omit<ReadyEntry, 'state' | 'payloadHash' | 'preparedAt'>,
  proof: PreparationProof) {
  if (proof.editorialPassed !== true || proof.structurePassed !== true ||
      proof.hash !== cmsFieldHash(proof.expected as unknown as Record<string, unknown>)) {
    throw new Error('liv_preparation_proof_invalid');
  }
  const inspected = await inspectLivCmsDraft({ itemId: entry.itemId, expected: proof.expected });
  if (!inspected.draftConfirmed || !inspected.publicationReady || !inspected.checks.length ||
      inspected.checks.some(c => !c.ok)) throw new Error('liv_preparation_cms_not_ready');
  await enqueueReadyArticle({ ...entry, ...(proof.planHash ? { planHash: proof.planHash } : {}) }, proof.expected);
}
