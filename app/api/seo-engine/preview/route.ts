import { NextRequest, NextResponse } from 'next/server';
import { previewAutoSeoBatch } from '@/lib/seo-engine/auto-seo-batch';
import { requireSeoEngineUser } from '@/lib/seo-engine/require-auth';
import { mapPipelineError } from '@/lib/seo-engine/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Read-only Scan: freezes candidates with lastUpdated + contentHash for Kør binding. */
export async function POST(req: NextRequest) {
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;
  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: number };
    const result = await previewAutoSeoBatch({
      limit: Number(body.limit || 50),
      userId: auth.userId,
    });
    return NextResponse.json({
      ok: true,
      scanId: result.scanId,
      total: result.total,
      ready: result.ready,
      totalCandidates: result.ready,
      missingSeo: result.missingSeo,
      validatorFlagged: result.validatorFlagged,
      fetchErrors: result.fetchErrors,
      candidates: result.candidates,
      results: result.candidates,
      scannedAt: result.scannedAt,
      expiresAt: result.expiresAt,
    });
  } catch (e) {
    return mapPipelineError(e);
  }
}
