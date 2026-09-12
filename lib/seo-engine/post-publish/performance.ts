import type { OpportunityScanReport, SeoOpportunity } from '@/lib/seo-engine/opportunity-engine/types';
import { inclusiveDaySpan } from '@/lib/seo-engine/opportunity-engine/gsc-windows';
import { stripHtmlToText } from '@/lib/seo-engine/html-text';
import { readPublishedArticle } from './cms';
import { enqueueQualityJob } from './jobs';
import { POST_PUBLISH_POLICY, type PerformanceEvidence } from './policy';
import type { ReviewArticle } from './review';

const metric = (value: number | null | undefined): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function performanceReviewInput(report: OpportunityScanReport, opportunity: SeoOpportunity): {
  evidence: PerformanceEvidence;
  context: NonNullable<ReviewArticle['performanceContext']>;
} | null {
  const period = report.comparison;
  const data = opportunity.evidence;
  const currentDays = period ? inclusiveDaySpan(period.currentStart, period.currentEnd) : 0;
  const previousDays = period ? inclusiveDaySpan(period.previousStart, period.previousEnd) : 0;
  if (!report.autoEnabled || !report.gscConfigured || !['ok', 'partial'].includes(report.status) || !period?.complete ||
    currentDays < POST_PUBLISH_POLICY.minimumWindowDays || currentDays !== previousDays ||
    period.previousEnd >= period.currentStart ||
    (metric(data.impressions) ?? -1) < POST_PUBLISH_POLICY.minimumImpressions ||
    (metric(data.prevImpressions) ?? -1) < POST_PUBLISH_POLICY.minimumImpressions) return null;
  return {
    evidence: { currentDays, previousDays, comparable: true, currentImpressions: data.impressions!,
      previousImpressions: data.prevImpressions!, fetchedAt: report.createdAt },
    context: { query: data.query || null, clicks: metric(data.clicks), impressions: metric(data.impressions),
      ctr: metric(data.ctr), position: metric(data.position), previousClicks: metric(data.prevClicks),
      previousImpressions: metric(data.prevImpressions), previousCtr: metric(data.prevCtr), previousPosition: metric(data.prevPosition),
      ga4PageViews: report.ga4Configured ? metric(data.ga4PageViews) : null,
      ga4EngagedSessions: report.ga4Configured ? metric(data.ga4EngagedSessions) : null,
      currentStart: period.currentStart, currentEnd: period.currentEnd,
      previousStart: period.previousStart, previousEnd: period.previousEnd },
  };
}

/** Existing GSC/GA4 collection feeds the SAME review/write queue as publication. */
export async function enqueuePerformanceReviews(report: OpportunityScanReport) {
  const queued: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const opportunity of report.opportunities.slice(0, 10)) {
    if (['applied', 'rejected', 'dismissed'].includes(opportunity.status)) {
      skipped.push({ id: opportunity.id, reason: `status_${opportunity.status}` }); continue;
    }
    const input = performanceReviewInput(report, opportunity);
    if (!input) { skipped.push({ id: opportunity.id, reason: 'insufficient_comparable_evidence' }); continue; }
    const current = await readPublishedArticle(opportunity.itemId, opportunity.locale);
    // A scan cannot justify changing metadata that an editor has since replaced.
    if (current.snapshot.metadata.seoTitle !== (opportunity.scannedSeoTitle || '') ||
      current.snapshot.metadata.metaDescription !== (opportunity.scannedMetaDescription || '')) {
      skipped.push({ id: opportunity.id, reason: 'metadata_changed_since_scan' }); continue;
    }
    const fd = current.live.fieldData;
    const result = await enqueueQualityJob({ source: 'performance', mode: 'performance', snapshot: current.snapshot,
      evidence: input.evidence, article: { editorialTitle: String(fd.name || ''), locale: opportunity.locale,
        metadata: current.snapshot.metadata, performanceContext: input.context,
        body: stripHtmlToText([fd.subtitle, fd.intro, fd.content].filter(Boolean).join('\n\n')),
        ...(typeof fd['article-type'] === 'string' ? { articleType: fd['article-type'] } : {}),
        ...(typeof fd.stjerne === 'number' ? { rating: fd.stjerne } : {}),
      } });
    if (result.jobId) queued.push(result.jobId);
    else skipped.push({ id: opportunity.id, reason: result.reason || 'not_enqueued' });
  }
  return { queued, skipped };
}
