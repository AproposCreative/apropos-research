import { resolveAutoOpportunityOptimizationEnabled } from '@/lib/seo-engine/opportunity-engine/settings';
import { stripHtmlToText } from '@/lib/seo-engine/html-text';
import { applyPublishedMetadata, readPublishedArticle, reconcilePublishedMetadata } from './cms';
import { claimQualityJob, checkpointQualityJob, enqueueQualityJob, finishQualityJob, getArticleQualityState, reserveQualityWrite, type QualityJob } from './jobs';
import { productionReviewModel } from './provider';
import { runQualityJob } from './worker';
import { checkLiveMetadataDuplicates } from './uniqueness';
import { acquireCmsWriteLease } from '@/lib/seo-engine/cms-write-lease';

export function runProductionQualityJob(id: string) {
  return runQualityJob(id, { claim: claimQualityJob, state: getArticleQualityState,
    read: readPublishedArticle, enabled: resolveAutoOpportunityOptimizationEnabled,
    model: productionReviewModel, reserve: reserveQualityWrite, checkpoint: checkpointQualityJob,
    finish: finishQualityJob, duplicates: checkLiveMetadataDuplicates,
    apply: async args => {
      // Serialize automatic metadata changes within the locale while comparing
      // against live peers. Never hold this global lease during AI generation.
      const lease = await acquireCmsWriteLease('seo-quality-uniqueness', args.analyzed.locale);
      try {
        const duplicates = await checkLiveMetadataDuplicates({ ...args.analyzed, metadata: { ...args.analyzed.metadata, ...args.patch } });
        if (Object.keys(args.patch).some(field => duplicates[field as keyof typeof duplicates].length)) throw new Error('seo_metadata_duplicate');
        await lease.assertOwned();
        // The item adapter fetches a fresh editorial snapshot AFTER this traversal.
        return await applyPublishedMetadata(args);
      } finally { await lease.release(); }
    }, reconcile: reconcilePublishedMetadata });
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
