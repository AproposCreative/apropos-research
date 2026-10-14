import { z } from 'zod';
import { snapshotHash } from './snapshot';
import { decideMetadataUpdate, reviewKey, type FieldAssessment } from './policy';
import type { QualityJob, ArticleQualityState } from './jobs';
import type { ArticleGoogleContext } from './google-context';

export const seoTaskId = z.string().regex(/^[a-f0-9]{64}$/);
const reason = z.string().trim().min(15).max(1500);
export const seoClaimInput = z.object({ requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  limit: z.number().int().min(1).max(2).default(2),
  articleId: z.string().regex(/^[a-f0-9]{24}$/).optional(), locale: z.enum(['da', 'en']).default('da') }).strict();
export const seoStatusInput = z.object({ taskId: seoTaskId,
  refreshGoogle: z.boolean().optional().describe('Only for an explicit Google diagnostic: return fresh read-only GSC/GA4 article data separately, without changing saved context, proposal or receipt. Do not poll or request for routine status.'),
  knownContextHash: seoTaskId.optional().describe('Only send the hash of full context actually available in this chat. A match returns compact status; a mismatch or omission returns the entire saved context.') }).strict();
const assessment = z.object({ field: z.enum(['seoTitle','metaDescription']), verdict: z.enum(['keep','improve','needs_editor']),
  reason, proposedValue: z.string().trim().min(10).max(320).optional(),
  articleQuotes: z.array(z.string().trim().min(15).max(700)).min(1).max(4),
}).strict();
export const seoProposalInput = z.object({ taskId: seoTaskId, expectedContextHash: seoTaskId,
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/), readFullArticle: z.literal(true),
  assessments: z.array(assessment).length(2) }).strict();
export const seoApplyInput = z.object({ taskId: seoTaskId, proposalHash: seoTaskId,
  recheck: z.object({ readFullArticle: z.literal(true), supported: z.boolean(), betterOrKept: z.boolean(), reason }).strict() }).strict();
export type ChatProposal = z.infer<typeof seoProposalInput> & { hash: string; savedAt: string; before: QualityJob['snapshot']['metadata'];
  after: QualityJob['snapshot']['metadata']; technicalDecision: ReturnType<typeof decideMetadataUpdate> };
export type ChatReview = { uid: string; claimedAt: string; contextHash: string; context: { snapshot: QualityJob['snapshot']; article: QualityJob['article'];
  publicUrl: string; fetchedAt: string; google: { evidence: QualityJob['evidence'] | null; context: QualityJob['article']['performanceContext'] | null; articleData?: ArticleGoogleContext } };
  batchId: string; previousStatus: string; proposal?: ChatProposal; recheck?: z.infer<typeof seoApplyInput>['recheck']; lastError?: string;
  completedAt?: string; provenance: 'chatgpt_editorial_review_not_independent_server_fact_check'; };

const normal = (s: string) => s.replace(/\s+/g, ' ').trim();
export function latestSeoCooldown(job: QualityJob, state: ArticleQualityState) {
  const dates = [state.lastAppliedAt, ...(job.mode === 'performance' ? [state.lastPerformanceReviewedAt] : [])].filter(Boolean) as string[];
  if (dates.some(d => !Number.isFinite(Date.parse(d)))) return 'invalid';
  return dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}
export function validateChatProposal(input: z.infer<typeof seoProposalInput>, job: QualityJob, state: ArticleQualityState) {
  if (!job.chatReview || input.expectedContextHash !== job.chatReview.contextHash) throw Error('seo_chat_context_changed');
  const seen = new Set<string>();
  const body = normal(job.chatReview.context.article.body);
  const assessments: FieldAssessment[] = input.assessments.map(a => {
    if (seen.has(a.field)) throw Error('seo_chat_duplicate_field'); seen.add(a.field);
    if ((a.verdict === 'improve') !== Boolean(a.proposedValue)) throw Error('seo_chat_invalid_candidate');
    if (a.proposedValue && (/[<>\x00-\x1f]/.test(a.proposedValue) || a.proposedValue.length > (a.field === 'seoTitle' ? 100 : 320))) throw Error('seo_chat_invalid_candidate');
    if (a.articleQuotes.some(q => !body.includes(normal(q)))) throw Error('seo_chat_quote_not_in_article');
    if (a.verdict === 'improve' && state.lockedFields.includes(a.field)) throw Error('seo_chat_field_locked');
    // Text overlap is NOT fact checking. The later caller recheck is explicitly
    // attributed to ChatGPT; no independent paid verifier or fabricated score.
    return { ...a, verifiedAgainstArticle: false };
  });
  const decision = decideMetadataUpdate({ analyzed: job.snapshot, fresh: job.chatReview.context.snapshot,
    assessments: assessments.map(a => ({ ...a, verifiedAgainstArticle: a.verdict === 'improve' })),
    mode: job.mode, evidence: job.evidence, nowMs: Date.now(), lockedFields: state.lockedFields, lastAppliedAt: latestSeoCooldown(job, state) });
  // This is an eligibility preview only. It is not the existing model's
  // independent candidate-verification evidence and cannot authorize a write.
  if (decision.action === 'apply') decision.reason = 'eligible_pending_chatgpt_recheck';
  return { assessments, decision, hash: snapshotHash({ ...input, reviewKey: reviewKey(job.snapshot) }) };
}
