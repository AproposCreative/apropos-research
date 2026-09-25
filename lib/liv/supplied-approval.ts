import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from './cms-field-hash';
import { livImageArticleHash } from './article-image-hash';
import { assertSuppliedCopyPreserved, suppliedArticleInput } from './supplied-article';
import type { GeneratedArticle } from './generate-article';
import type { SafetyGatesOutput } from './run-safety-gates';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const suppliedApprovalInput = z.object({
  dayKey: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/),
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  expectedCheckpointHash: hash,
  reason: z.string().trim().min(10).max(500),
  authority: z.literal('owner-approved-original-review'),
  cover: z.object({ base64: z.string().min(100).max(2800000),
    alt: z.string().trim().min(10).max(240), credit: z.string().trim().min(3).max(200),
    preservePrintedBookTitle: z.literal(true),
  }).strict().optional(),
}).strict();

/** This route is only for an explicitly supplied original book review, not an
 * escape hatch for failed generated copy. No fabricated AI verification. */
export function assertSuppliedApprovalEligible(article: GeneratedArticle, reservation: any, row: any) {
  const original = suppliedArticleInput.parse(reservation?.input?.suppliedArticle);
  if (reservation.inputHash !== cmsFieldHash(reservation.input) || row.explicitPreparationInputHash !== reservation.inputHash ||
    article.aiModel !== 'human-editorial' || article.subjectType !== 'literature' ||
    article.articleFormat !== 'research-review' || article.selectedImage?.editorialEdit ||
    article.selectedImage?.articleHash !== livImageArticleHash(article) || article.preparedMedia?.length !== 3 ||
    new Set(article.preparedMedia.map(m => m.role)).size !== 3 ||
    new Set(article.preparedMedia.map(m => m.contentHash)).size !== 3) throw Error('liv_supplied_approval_ineligible');
  assertSuppliedCopyPreserved(article, original);
}

export type SuppliedApproval = { id: string; runId: string; checkpointHash: string; reservationHash: string;
  ownerUid: string; createdAt: string; authority: 'owner-approved-original-review'; reason: string };

export async function readSuppliedApproval(runId: string, article: GeneratedArticle, reservation: any, row: any): Promise<SuppliedApproval | null> {
  const db = getAdminDb(); if (!db) throw Error('liv_supplied_approval_store_unavailable');
  const ref = row.suppliedEditorialApproval;
  if (!ref) return null;
  assertSuppliedApprovalEligible(article, reservation, row);
  const saved = (await db.collection('livDailyArticles').doc(runId).collection('suppliedApprovals').doc(ref.id).get()).data();
  const approval = saved?.approval as SuppliedApproval | undefined;
  if (!approval || saved!.approvalHash !== cmsFieldHash(approval) || ref.hash !== saved!.approvalHash ||
    approval.runId !== runId || approval.id !== ref.id || approval.checkpointHash !== cmsFieldHash({ ...article }) ||
    approval.reservationHash !== reservation.inputHash || !approval.ownerUid ||
    approval.authority !== 'owner-approved-original-review') throw Error('liv_supplied_approval_mismatch');
  return approval;
}

export function suppliedApprovalGates(approval: SuppliedApproval): SafetyGatesOutput {
  return { pass: true, results: [{ name: 'owner-editorial-approval', pass: true,
    detail: `Original anmeldelse godkendt redaktionelt (${approval.id}). Ingen påstand om AI-faktatjek eller uafhængig læsning.` },
  { name: 'supplied-copy-preserved', pass: true, detail: 'Original tekst og vurdering bevaret; godkendelsen gælder præcis denne artikelversion.' }] };
}
