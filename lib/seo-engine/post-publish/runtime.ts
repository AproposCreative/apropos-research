import { resolveAutoOpportunityOptimizationEnabled } from '@/lib/seo-engine/opportunity-engine/settings';
import { stripHtmlToText } from '@/lib/seo-engine/html-text';
import { applyPublishedMetadata, readPublishedArticle, reconcilePublishedMetadata } from './cms';
import { claimQualityJob, checkpointQualityJob, enqueueQualityJob, finishQualityJob, getArticleQualityState, reserveQualityWrite, type QualityJob } from './jobs';
import { productionReviewModel } from './provider';
import { runQualityJob } from './worker';

export function runProductionQualityJob(id: string) {
  return runQualityJob(id, { claim: claimQualityJob, state: getArticleQualityState,
    read: readPublishedArticle, enabled: resolveAutoOpportunityOptimizationEnabled,
    model: productionReviewModel, reserve: reserveQualityWrite, checkpoint: checkpointQualityJob,
    finish: finishQualityJob, apply: applyPublishedMetadata, reconcile: reconcilePublishedMetadata });
}

export async function enqueuePublishedQualityReview(itemId: string, locale: 'da' | 'en', source: QualityJob['source']) {
  if (!(await resolveAutoOpportunityOptimizationEnabled())) return { enqueued: false, reason: 'auto_disabled' };
  const current = await readPublishedArticle(itemId, locale);
  const fd = current.live.fieldData;
  return enqueueQualityJob({ source, snapshot: current.snapshot, mode: 'publication_quality', article: {
    editorialTitle: String(fd.name || ''), locale, metadata: current.snapshot.metadata,
    body: stripHtmlToText([fd.subtitle, fd.intro, fd.content].filter(Boolean).join('\n\n')),
    ...(typeof fd['article-type'] === 'string' ? { articleType: fd['article-type'] } : {}),
    ...(typeof fd.stjerne === 'number' ? { rating: fd.stjerne } : {}),
  } });
}
