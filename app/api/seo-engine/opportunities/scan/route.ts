import { NextRequest, NextResponse } from 'next/server';
import { requireSeoEngineUser } from '@/lib/seo-engine/require-auth';
import { mapPipelineError } from '@/lib/seo-engine/http';
import { runOpportunityScan } from '@/lib/seo-engine/opportunity-engine/engine';
import { maybeAutoApplyOpportunities } from '@/lib/seo-engine/opportunity-engine/apply';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/** Manual Scan/Kør for the opportunity queue. */
export async function POST(req: NextRequest) {
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      limit?: number;
      autoApply?: boolean;
    };
    const report = await runOpportunityScan({
      actor: auth.userId,
      limit: body.limit,
      persist: true,
    });

    let autoApply: { applied: string[]; skipped: string[] } | null = null;
    if (body.autoApply === true) {
      autoApply = await maybeAutoApplyOpportunities({
        opportunities: report.opportunities,
        actor: auth.userId,
      });
    }

    return NextResponse.json({
      ok: true,
      report,
      autoApply,
    });
  } catch (e) {
    return mapPipelineError(e);
  }
}
