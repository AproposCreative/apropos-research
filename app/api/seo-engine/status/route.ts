import { NextRequest, NextResponse } from 'next/server';
import {
  isAutoSeoEngineEnabledFromEnv,
  resolveAutoSeoEngineEnabled,
  setAutoSeoEngineEnabled,
} from '@/lib/seo-engine/settings';
import {
  isAutoOpportunityOptimizationEnabledFromEnv,
  resolveAutoOpportunityOptimizationEnabled,
  setAutoOpportunityOptimizationEnabled,
} from '@/lib/seo-engine/opportunity-engine/settings';
import { requireSeoEngineAdmin, requireSeoEngineUser } from '@/lib/seo-engine/require-auth';
import { mapPipelineError } from '@/lib/seo-engine/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;
  try {
    const enabled = await resolveAutoSeoEngineEnabled();
    const autoOpportunityOptEnabled = await resolveAutoOpportunityOptimizationEnabled();
    return NextResponse.json({
      ok: true,
      enabled,
      envDefault: isAutoSeoEngineEnabledFromEnv(),
      canToggle: auth.isAdmin,
      autoOpportunityOptEnabled,
      autoOpportunityOptEnvDefault: isAutoOpportunityOptimizationEnabledFromEnv(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Kunne ikke hente status' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;
  try {
    requireSeoEngineAdmin(auth.userId);
    const body = (await req.json().catch(() => ({}))) as {
      enabled?: boolean;
      autoOpportunityOptEnabled?: boolean;
    };
    if (typeof body.autoOpportunityOptEnabled === 'boolean') {
      await setAutoOpportunityOptimizationEnabled(body.autoOpportunityOptEnabled);
      return NextResponse.json({
        ok: true,
        autoOpportunityOptEnabled: body.autoOpportunityOptEnabled,
      });
    }
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json(
        { ok: false, error: 'enabled eller autoOpportunityOptEnabled skal være boolean' },
        { status: 400 }
      );
    }
    await setAutoSeoEngineEnabled(body.enabled);
    return NextResponse.json({ ok: true, enabled: body.enabled });
  } catch (e) {
    return mapPipelineError(e);
  }
}
