import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/seo-engine/post-publish/cms', () => ({ readPublishedArticle: vi.fn() }));
vi.mock('@/lib/seo-engine/post-publish/jobs', () => ({ enqueueQualityJob: vi.fn() }));
import { performanceReviewInput } from '../../../lib/seo-engine/post-publish/performance';
import type { OpportunityScanReport, SeoOpportunity } from '../../../lib/seo-engine/opportunity-engine/types';

const report = { autoEnabled: true, gscConfigured: true, ga4Configured: true, status: 'ok',
  createdAt: '2026-09-12T12:00:00Z', comparison: { currentStart: '2026-08-13', currentEnd: '2026-09-09',
    previousStart: '2026-07-16', previousEnd: '2026-08-12', complete: true } } as OpportunityScanReport;
const opportunity = { evidence: { query: 'Mayday anmeldelse', impressions: 500, prevImpressions: 400,
  clicks: 20, prevClicks: 25, ctr: 0.04, prevCtr: 0.0625, position: 8, prevPosition: 6,
  ga4PageViews: 150, ga4EngagedSessions: 80 } } as SeoOpportunity;

describe('performance review evidence', () => {
  it('passes real query/CTR/position and GA4 context with explicit periods', () => {
    const result = performanceReviewInput(report, opportunity);
    expect(result?.evidence).toMatchObject({ currentDays: 28, previousDays: 28, currentImpressions: 500, previousImpressions: 400 });
    expect(result?.context).toMatchObject({ query: 'Mayday anmeldelse', ctr: 0.04, previousPosition: 6, ga4EngagedSessions: 80 });
  });
  it('represents missing GA4 as unknown, not zero', () => {
    expect(performanceReviewInput({ ...report, ga4Configured: false }, opportunity)?.context.ga4PageViews).toBeNull();
  });
  it('rejects incomplete, overlapping or small comparison windows', () => {
    expect(performanceReviewInput({ ...report, comparison: { ...report.comparison!, complete: false } }, opportunity)).toBeNull();
    expect(performanceReviewInput({ ...report, comparison: { ...report.comparison!, previousEnd: '2026-08-14' } }, opportunity)).toBeNull();
    expect(performanceReviewInput(report, { ...opportunity, evidence: { ...opportunity.evidence, prevImpressions: 10 } })).toBeNull();
  });
  it('does not optimize using missing connections or failed scans', () => {
    expect(performanceReviewInput({ ...report, gscConfigured: false }, opportunity)).toBeNull();
    expect(performanceReviewInput({ ...report, status: 'error' }, opportunity)).toBeNull();
    expect(performanceReviewInput({ ...report, autoEnabled: false }, opportunity)).toBeNull();
  });
});
