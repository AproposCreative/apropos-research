import { NextRequest, NextResponse } from 'next/server';
import { requireSeoEngineUser } from '@/lib/seo-engine/require-auth';
import { mapPipelineError } from '@/lib/seo-engine/http';
import { listOpportunities } from '@/lib/seo-engine/opportunity-engine/store';
import {
  resolveAutoOpportunityOptimizationEnabled,
  isAutoOpportunityOptimizationEnabledFromEnv,
} from '@/lib/seo-engine/opportunity-engine/settings';
import { getConfiguredGscSiteUrl } from '@/lib/gsc/google-auth';
import { getGa4PropertyResourceName } from '@/lib/ga4/property';
import type { OpportunityStatus } from '@/lib/seo-engine/opportunity-engine/types';

export const dynamic = 'force-dynamic';

/** List opportunity queue + connection status (no mock data). */
export async function GET(req: NextRequest) {
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;
  try {
    const statusParam = req.nextUrl.searchParams.get('status') || 'open';
    const limit = Number(req.nextUrl.searchParams.get('limit') || 50);
    const allowed = [
      'open',
      'approved',
      'applied',
      'rejected',
      'rolled_back',
      'dismissed',
      'all',
    ];
    const status = (
      allowed.includes(statusParam) ? statusParam : 'open'
    ) as OpportunityStatus | 'all';

    const opportunities = await listOpportunities({ status, limit });
    const autoOpt = await resolveAutoOpportunityOptimizationEnabled();
    const gscConfigured = Boolean(getConfiguredGscSiteUrl());
    const ga4Configured = Boolean(getGa4PropertyResourceName());

    let connectionStatus: 'ready' | 'missing_gsc' | 'missing_ga4' | 'missing_both' = 'ready';
    let connectionMessage = 'GSC + GA4 konfigureret — klar til scan';
    if (!gscConfigured && !ga4Configured) {
      connectionStatus = 'missing_both';
      connectionMessage =
        'GSC_SITE_URL og GA4_PROPERTY_ID mangler — opportunity engine kører ikke med mock-data';
    } else if (!gscConfigured) {
      connectionStatus = 'missing_gsc';
      connectionMessage =
        'GSC_SITE_URL mangler — query-muligheder kræver direkte Search Console (se docs)';
    } else if (!ga4Configured) {
      connectionStatus = 'missing_ga4';
      connectionMessage = 'GA4_PROPERTY_ID mangler — engagement-evidens springes over';
    }

    return NextResponse.json({
      ok: true,
      opportunities,
      connectionStatus,
      connectionMessage,
      gscConfigured,
      ga4Configured,
      autoOpportunityOptEnabled: autoOpt,
      autoOpportunityOptEnvDefault: isAutoOpportunityOptimizationEnabledFromEnv(),
      canToggleAutoOpt: auth.isAdmin,
      mode: autoOpt ? 'auto_optimization' : 'recommendation_approval',
    });
  } catch (e) {
    return mapPipelineError(e);
  }
}
