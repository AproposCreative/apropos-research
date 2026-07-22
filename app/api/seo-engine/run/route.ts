import { NextRequest, NextResponse } from 'next/server';
import { runAutoSeoBatch, type AutoSeoRunCandidateInput } from '@/lib/seo-engine/auto-seo-batch';
import { requireSeoEngineAdmin, requireSeoEngineUser } from '@/lib/seo-engine/require-auth';
import { mapPipelineError } from '@/lib/seo-engine/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Kør: requires scanId + candidates from Scan (fingerprints).
 * Processes via durable enqueue + runSeoEngineJob (max 3). Admin-gated.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;
  try {
    requireSeoEngineAdmin(auth.userId);
    const body = (await req.json().catch(() => ({}))) as {
      scanId?: string;
      candidates?: AutoSeoRunCandidateInput[];
      articleLimit?: number;
    };
    if (!body.scanId?.trim()) {
      return NextResponse.json(
        { ok: false, error: 'scanId er påkrævet — kør Scan først' },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'candidates fra Scan er påkrævet' },
        { status: 400 }
      );
    }
    const result = await runAutoSeoBatch({
      scanId: body.scanId,
      candidates: body.candidates,
      articleLimit: Number(body.articleLimit || 3),
      userId: auth.userId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return mapPipelineError(e);
  }
}
