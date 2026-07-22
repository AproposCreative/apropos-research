import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getAnalysisRun, getSeoVersion } from '@/lib/seo-engine/store';
import { jsonError } from '@/lib/seo-engine/http';
import { getAdminDb } from '@/lib/firebase-admin';
import { toConfidenceBand } from '@/lib/seo-engine/confidence';
import { assertOwnershipOrAdmin, requireSeoEngineUser } from '@/lib/seo-engine/require-auth';

export async function GET(req: NextRequest) {
  if (!getAdminDb()) {
    return jsonError(503, 'fail_closed', 'Firestore er ikke konfigureret');
  }
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const analysisRunId = sp.get('analysisRunId');
  const seoVersionId = sp.get('seoVersionId');

  if (analysisRunId) {
    const run = await getAnalysisRun(analysisRunId);
    if (!run) return jsonError(404, 'not_found', 'analysisRun findes ikke');
    try {
      assertOwnershipOrAdmin({ userId: auth.userId, createdBy: run.createdBy });
    } catch {
      return jsonError(403, 'forbidden', 'Ingen adgang');
    }
    const band = run.analysis
      ? toConfidenceBand({
          raw: run.analysis.primaryEntity.confidence,
          evidenceCount: run.analysis.primaryEntity.evidence.length,
          hasConflict: run.analysis.articleType.conflict,
          missingFactCount: run.analysis.facts.missing.length,
          inputMode: run.inputMode,
        })
      : null;
    return NextResponse.json({ ok: true, analysisRun: run, confidenceBand: band });
  }

  if (seoVersionId) {
    const version = await getSeoVersion(seoVersionId);
    if (!version) return jsonError(404, 'not_found', 'seoVersion findes ikke');
    try {
      assertOwnershipOrAdmin({ userId: auth.userId, createdBy: version.createdBy });
    } catch {
      return jsonError(403, 'forbidden', 'Ingen adgang');
    }
    return NextResponse.json({ ok: true, seoVersion: version });
  }

  return jsonError(400, 'invalid_input', 'analysisRunId eller seoVersionId kræves');
}
