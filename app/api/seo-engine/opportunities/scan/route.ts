import { NextRequest, NextResponse } from 'next/server';
import { requireSeoEngineUser } from '@/lib/seo-engine/require-auth';
import { mapPipelineError } from '@/lib/seo-engine/http';
import { runOpportunityScan } from '@/lib/seo-engine/opportunity-engine/engine';
import { enqueuePerformanceReviews } from '@/lib/seo-engine/post-publish/performance';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * Optional manual scan (not required for normal ops).
 * Default is collection only. Optimization writes require explicit autoApply=true.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      limit?: number;
      mode?: 'collect' | 'optimize';
      /** Explicit opt-in to queue verified live metadata optimization. */
      autoApply?: boolean;
    };
    const mode = body.mode || 'collect';
    const report = await runOpportunityScan({
      actor: auth.userId,
      limit: body.limit,
      persist: true,
      mode,
    });

    let autoApply: { applied: string[]; queued?: string[]; skipped: Array<{ id: string; reason: string }> } | null =
      null;
    const shouldApply = body.autoApply === true && mode === 'optimize';
    if (shouldApply) {
      autoApply = { applied: [], ...await enqueuePerformanceReviews(report) };
    }

    return NextResponse.json({
      ok: true,
      report,
      autoApply,
      note: 'Manuel scan er valgfri — daglig collect + ugentlig optimize kører via cron.',
    });
  } catch (e) {
    return mapPipelineError(e);
  }
}
