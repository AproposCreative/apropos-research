import { NextRequest, NextResponse } from 'next/server';
import {
  isAutoSeoEngineEnabledFromEnv,
  resolveAutoSeoEngineEnabled,
  setAutoSeoEngineEnabled,
} from '@/lib/seo-engine/settings';
import { requireSeoEngineAdmin, requireSeoEngineUser } from '@/lib/seo-engine/require-auth';
import { mapPipelineError } from '@/lib/seo-engine/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;
  try {
    const enabled = await resolveAutoSeoEngineEnabled();
    return NextResponse.json({
      ok: true,
      enabled,
      envDefault: isAutoSeoEngineEnabledFromEnv(),
      canToggle: auth.isAdmin,
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
    const body = (await req.json().catch(() => ({}))) as { enabled?: boolean };
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json(
        { ok: false, error: 'enabled skal være true eller false' },
        { status: 400 }
      );
    }
    await setAutoSeoEngineEnabled(body.enabled);
    return NextResponse.json({ ok: true, enabled: body.enabled });
  } catch (e) {
    return mapPipelineError(e);
  }
}
