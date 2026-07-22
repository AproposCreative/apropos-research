import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { strategizeFromRun } from '@/lib/seo-engine/pipeline';
import { jsonError, mapPipelineError } from '@/lib/seo-engine/http';
import { getAdminDb } from '@/lib/firebase-admin';
import { getAnalysisRun } from '@/lib/seo-engine/store';
import { assertOwnershipOrAdmin, requireSeoEngineUser } from '@/lib/seo-engine/require-auth';
import { isEphemeralDemoRequest } from '@/lib/seo-engine/ephemeral-demo';
import { runEphemeralDemoPipeline } from '@/lib/seo-engine/ephemeral-pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (isEphemeralDemoRequest(req, body)) {
      // Ephemeral strategize: re-run full in-memory pipeline from currentInput (no run store)
      if (!body?.currentInput && !body?.input) {
        return jsonError(400, 'invalid_input', 'ephemeral strategize kræver currentInput');
      }
      const result = runEphemeralDemoPipeline(body.currentInput || body.input);
      return NextResponse.json({
        ok: true,
        seoVersionId: result.seoVersionId,
        revision: 1,
        pack: result.pack,
        validation: result.validation,
        stale: false,
        mode: 'demo',
        ephemeral: true,
        persistDisabled: true,
        demoNotice: result.demoNotice,
      });
    }

    if (!getAdminDb()) {
      return jsonError(503, 'fail_closed', 'Firestore er ikke konfigureret');
    }
    const auth = await requireSeoEngineUser(req);
    if (!auth.ok) return auth.response;

    const analysisRunId = String(body?.analysisRunId || '');
    if (!analysisRunId) return jsonError(400, 'invalid_input', 'analysisRunId mangler');
    const run = await getAnalysisRun(analysisRunId);
    if (!run) return jsonError(404, 'not_found', 'analysisRun findes ikke');
    try {
      assertOwnershipOrAdmin({ userId: auth.userId, createdBy: run.createdBy });
    } catch {
      return jsonError(403, 'forbidden', 'Ingen adgang til denne analyse');
    }
    const result = await strategizeFromRun(analysisRunId, {
      userId: auth.userId,
      currentInput: body?.currentInput,
      forceDemo: body?.forceDemo === true || process.env.SEO_ENGINE_DEMO === 'true',
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return mapPipelineError(e);
  }
}
