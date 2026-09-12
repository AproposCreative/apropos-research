import { decideMetadataUpdate, POST_PUBLISH_POLICY, reviewKey, type PublishedArticle, type PolicyDecision } from './policy';
import { reviewPublishedMetadata, type ReviewModelCall } from './review';
import type { QualityJob, ArticleQualityState } from './jobs';

type Receipt = { after: PublishedArticle; publicReceipt: { url: string; checkedAt: string } };
export type QualityWorkerDependencies = {
  claim: (id: string) => Promise<QualityJob | null>;
  state: (itemId: string, locale: string) => Promise<ArticleQualityState>;
  read: (itemId: string, locale: 'da' | 'en') => Promise<{ snapshot: PublishedArticle }>;
  enabled: () => Promise<boolean>;
  model: (jobId: string) => ReviewModelCall;
  reserve: (job: QualityJob, decision: PolicyDecision) => Promise<void>;
  checkpoint: (job: QualityJob, patch: Partial<QualityJob>, release?: boolean) => Promise<void>;
  finish: (job: QualityJob, patch: Partial<QualityJob>) => Promise<void>;
  apply: (args: { analyzed: PublishedArticle; patch: PolicyDecision['patch']; beforeWrite: (fresh: PublishedArticle) => Promise<void> }) => Promise<Receipt>;
  reconcile: (before: PublishedArticle, patch: PolicyDecision['patch']) => Promise<Receipt>;
  now?: () => number;
};

export async function runQualityJob(id: string, deps: QualityWorkerDependencies) {
  // Reconciliation remains possible when new optimization is emergency-stopped.
  const job = await deps.claim(id);
  if (!job) return { ok: true, status: 'not_claimed' };
  const finish = async (status: QualityJob['status'], reason: string, extra: Partial<QualityJob> = {}) => {
    await deps.finish(job, { ...extra, status, reason });
    return { ok: status !== 'failed' && status !== 'needs_editor', status, reason };
  };
  try {
    if (job.writeStartedAt) {
      if (!job.decision || job.decision.action !== 'apply') throw new Error('seo_write_intent_missing');
      const receipt = await deps.reconcile(job.snapshot, job.decision.patch);
      return await finish('applied', 'reconciled_public_metadata', receipt);
    }
    if (!(await deps.enabled())) {
      await deps.checkpoint(job, { status: 'queued', reason: 'auto_disabled', attempt: job.attempt - 1 }, true);
      return { ok: true, status: 'queued', reason: 'auto_disabled' };
    }
    const state = await deps.state(job.snapshot.itemId, job.snapshot.locale);
    if (state.pendingJobId && state.pendingJobId !== job.id) {
      await deps.checkpoint(job, { status: 'queued', reason: 'article_write_pending', attempt: job.attempt - 1 }, true);
      return { ok: true, status: 'queued', reason: 'article_write_pending' };
    }
    const fresh = await deps.read(job.snapshot.itemId, job.snapshot.locale);
    if (!fresh.snapshot.published || fresh.snapshot.hasUnpublishedChanges || reviewKey(fresh.snapshot) !== reviewKey(job.snapshot)) {
      return await finish('stale', 'article_changed');
    }
    if (state.lockedFields.includes('seoTitle') && state.lockedFields.includes('metaDescription')) return await finish('kept', 'editorial_locks');
    if (state.lastAppliedAt && (deps.now?.() ?? Date.now()) - Date.parse(state.lastAppliedAt) < POST_PUBLISH_POLICY.cooldownMs) {
      return await finish('kept', 'cooldown');
    }
    const review = await reviewPublishedMetadata(job.article, deps.model(job.id));
    // Model output is already durable; refresh editorial state after its latency.
    const current = await deps.read(job.snapshot.itemId, job.snapshot.locale);
    const currentState = await deps.state(job.snapshot.itemId, job.snapshot.locale);
    const decision = decideMetadataUpdate({ analyzed: job.snapshot, fresh: current.snapshot,
      assessments: review.assessments, lockedFields: currentState.lockedFields, mode: job.mode,
      nowMs: deps.now?.() ?? Date.now(), lastAppliedAt: currentState.lastAppliedAt, evidence: job.evidence });
    await deps.checkpoint(job, { decision });
    if (decision.action !== 'apply') {
      return await finish(decision.action === 'keep' ? 'kept' : decision.action === 'needs_editor' ? 'needs_editor' : 'stale', decision.reason, { decision });
    }
    const receipt = await deps.apply({ analyzed: job.snapshot, patch: decision.patch,
      beforeWrite: async () => {
        if (!(await deps.enabled())) throw new Error('seo_auto_disabled_before_write');
        await deps.reserve(job, decision);
      } });
    return await finish('applied', 'verified_public_metadata', receipt);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'seo_quality_failed';
    const status: QualityJob['status'] = job.writeStartedAt ? 'verify_pending'
      : reason.includes('reconciliation') || reason.includes('request_changed') ? 'needs_editor'
      : job.attempt >= 5 ? 'failed' : 'queued';
    await deps.checkpoint(job, { status, reason }, true);
    return { ok: false, status, reason };
  }
}
