import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { assertAnalyzeRateLimit } from '@/lib/seo-engine/rate-limit';
import { analyzeArticle } from '@/lib/seo-engine/pipeline';
import { jsonError, mapPipelineError } from '@/lib/seo-engine/http';
import { toConfidenceBand } from '@/lib/seo-engine/confidence';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireSeoEngineUser } from '@/lib/seo-engine/require-auth';
import { isEphemeralDemoRequest } from '@/lib/seo-engine/ephemeral-demo';
import { runEphemeralDemoPipeline } from '@/lib/seo-engine/ephemeral-pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (isEphemeralDemoRequest(req, body)) {
      const result = runEphemeralDemoPipeline(body?.input ?? body);
      return NextResponse.json({ ok: true, ...result });
    }

    if (!getAdminDb()) {
      return jsonError(503, 'fail_closed', 'Firestore er ikke konfigureret');
    }

    const auth = await requireSeoEngineUser(req);
    if (!auth.ok) return auth.response;

    try {
      await assertAnalyzeRateLimit(auth.userId);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.message === 'rate_limited' || err.code === 'rate_limited') {
        return jsonError(429, 'rate_limited', 'For mange analyse-kald — prøv senere');
      }
      return jsonError(503, 'rate_limit_unavailable', 'Rate limit utilgængelig');
    }

    const forceDemo = body?.forceDemo === true || process.env.SEO_ENGINE_DEMO === 'true';
    const result = await analyzeArticle(body?.input ?? body, {
      userId: auth.userId,
      forceDemo,
      articleKey: body?.articleKey ?? body?.input?.articleKey,
      webflowItemId: body?.webflowItemId ?? body?.input?.webflowItemId,
    });

    const band = toConfidenceBand({
      raw: result.analysis.primaryEntity.confidence,
      evidenceCount: result.analysis.primaryEntity.evidence.length,
      hasConflict: result.analysis.articleType.conflict,
      missingFactCount: result.analysis.facts.missing.length,
      inputMode: result.inputMode,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      confidenceBand: band,
      demoNotice:
        result.mode === 'demo'
          ? 'Demo-heuristik (SEO_ENGINE_DEMO) — ikke fuld AI-analyse'
          : null,
    });
  } catch (e) {
    return mapPipelineError(e);
  }
}
