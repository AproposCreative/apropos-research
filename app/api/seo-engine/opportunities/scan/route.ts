import { NextRequest, NextResponse } from 'next/server';
import { requireSeoEngineUser } from '@/lib/seo-engine/require-auth';
import { mapPipelineError } from '@/lib/seo-engine/http';
import { runOpportunityScan } from '@/lib/seo-engine/opportunity-engine/engine';
import { maybeAutoApplyOpportunities } from '@/lib/seo-engine/opportunity-engine/apply';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * Optional manual scan (not required for normal ops).
 * Default mode=optimize and auto-applies when automatic drift is active.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      limit?: number;
      mode?: 'collect' | 'optimize';
      /** @deprecated — automatic by default; set false to collect-only */
      autoApply?: boolean;
    };
    const mode = body.mode || 'optimize';
    const report = await runOpportunityScan({
      actor: auth.userId,
      limit: body.limit,
      persist: true,
      mode,
    });

    let autoApply: { applied: string[]; skipped: Array<{ id: string; reason: string }> } | null =
      null;
    const shouldApply = body.autoApply !== false && mode === 'optimize';
    if (shouldApply) {
      autoApply = await maybeAutoApplyOpportunities({
        opportunities: report.opportunities,
        actor: auth.userId,
      });
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
