import { NextRequest, NextResponse } from 'next/server';
import { isApiRequestAuthorized } from '@/lib/api/middleware-auth';
import { getRequestId } from '@/lib/api/request-utils';
import { createSuccessResponse } from '@/lib/api/types';
import { getWriterResearch, writerResearchScope } from '@/lib/ai-chat/research-cache';
import { evaluateResearchQuality } from '@/lib/research/qualityGate';
import { withLivCostRequest, withSharedCostContext } from '@/lib/liv/cost-context';
import { getLivCostPretransportError } from '@/lib/liv/cost-errors';

export const maxDuration = 60;

/** Source discovery, not a substitute for article-level verification. */
export async function POST(request: NextRequest) {
  if (!await isApiRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const requestId = getRequestId(request);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.topic !== 'string' || !body.topic.trim() || body.topic.length > 1000) {
    return NextResponse.json({ error: 'Emnet skal være mellem 1 og 1000 tegn.', requestId }, { status: 400 });
  }
  try {
    return await withLivCostRequest(request, 'research-engine', () =>
      withSharedCostContext({ scope: 'writer', stage: 'research-engine' }, async () => {
        const result = await getWriterResearch(writerResearchScope(request.headers), body.topic.trim(),
          { maxResults: 3, timeoutMs: 45000, allowFallback: false });
        if (!evaluateResearchQuality(result).pass) {
          return NextResponse.json({ error: 'Der blev ikke fundet tilstrækkeligt kildemateriale.', complete: false, requestId },
            { status: 503, headers: { 'Cache-Control': 'no-store' } });
        }
        return NextResponse.json(createSuccessResponse({
          topic: body.topic.trim(), researchSummary: result.contextText,
          sources: result.sources.flatMap(source => source.url ? [source.url] : []),
          sourceDetails: result.sources,
          // Discovery is not verified factual or expert-opinion evidence.
          keyFindings: [], culturalContext: [], expertInsights: [], factualData: [],
          trends: [], suggestedAngles: [], verificationStatus: 'discovery_only',
        }, { requestId }), { headers: { 'Cache-Control': 'no-store' } });
      }));
  } catch (error) {
    return NextResponse.json({
      error: getLivCostPretransportError(error) ? 'Research blev stoppet af budgetkontrollen.' : 'Research kunne ikke gennemføres.',
      complete: false, requestId,
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
