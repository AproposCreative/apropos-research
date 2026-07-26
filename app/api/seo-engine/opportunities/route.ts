import { NextRequest, NextResponse } from 'next/server';
import { requireSeoEngineUser } from '@/lib/seo-engine/require-auth';
import { mapPipelineError } from '@/lib/seo-engine/http';
import { listOpportunities } from '@/lib/seo-engine/opportunity-engine/store';
import {
  resolveAutoOpportunityOptimizationEnabled,
  isAutoOpportunityOptimizationEnabledFromEnv,
  resolveAutomaticOpportunityRuntime,
} from '@/lib/seo-engine/opportunity-engine/settings';
import { assessOpportunityConnections } from '@/lib/seo-engine/opportunity-engine/connections';
import type { OpportunityStatus } from '@/lib/seo-engine/opportunity-engine/types';

export const dynamic = 'force-dynamic';

/** List opportunity queue + automatic-drift status (no mock data). */
export async function GET(req: NextRequest) {
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;
  try {
    const statusParam = req.nextUrl.searchParams.get('status') || 'all';
    const limit = Number(req.nextUrl.searchParams.get('limit') || 50);
    const allowed = [
      'open',
      'approved',
      'applied',
      'rejected',
      'rolled_back',
      'dismissed',
      'skipped',
      'all',
    ];
    const status = (
      allowed.includes(statusParam) ? statusParam : 'all'
    ) as OpportunityStatus | 'all';

    const [opportunities, autoOpt, runtime, health] = await Promise.all([
      listOpportunities({ status, limit }),
      resolveAutoOpportunityOptimizationEnabled(),
      resolveAutomaticOpportunityRuntime(),
      assessOpportunityConnections(),
    ]);

    return NextResponse.json({
      ok: true,
      opportunities,
      connectionStatus: health.healthy
        ? 'ready'
        : !health.gsc.ok && !health.webflow.ok
          ? 'missing_both'
          : !health.gsc.ok
            ? 'missing_gsc'
            : !health.ga4.ok
              ? 'missing_ga4'
              : 'partial',
      connectionMessage: health.summary,
      gscConfigured: health.gsc.ok,
      ga4Configured: health.ga4.ok,
      webflowConfigured: health.webflow.ok,
      autoOpportunityOptEnabled: autoOpt,
      autoOpportunityOptEnvDefault: isAutoOpportunityOptimizationEnabledFromEnv(),
      canToggleAutoOpt: auth.isAdmin,
      /** Production default = automatic; UI is status + emergency stop. */
      mode: runtime.shouldAutoOptimize
        ? 'automatic'
        : autoOpt
          ? 'waiting_for_connections'
          : 'emergency_stopped',
      runtime,
      teamNote:
        'Automatisk drift — teamet behøver ikke løbende Scan/godkendelse. Brug nød-stop ved behov; manuel rollback er tilgængelig.',
    });
  } catch (e) {
    return mapPipelineError(e);
  }
}
