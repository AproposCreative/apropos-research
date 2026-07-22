import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { saveFields } from '@/lib/seo-engine/pipeline';
import { jsonError, mapPipelineError } from '@/lib/seo-engine/http';
import { getAdminDb } from '@/lib/firebase-admin';
import { getSeoVersion } from '@/lib/seo-engine/store';
import { assertOwnershipOrAdmin, requireSeoEngineUser } from '@/lib/seo-engine/require-auth';
import { isEphemeralDemoRequest } from '@/lib/seo-engine/ephemeral-demo';

/**
 * POST /api/seo-engine/save-fields
 * Body: { seoVersionId, expectedRevision, patches[], adoptStrategyId?, currentInput? }
 */
export async function POST(req: NextRequest) {
  if (isEphemeralDemoRequest(req)) {
    return jsonError(400, 'demo_ephemeral', 'Gem er utilgængeligt i ephemeral demo (ingen persistens)');
  }
  if (!getAdminDb()) {
    return jsonError(503, 'fail_closed', 'Firestore er ikke konfigureret');
  }
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const seoVersionId = String(body?.seoVersionId || '').trim();
    const expectedRevision = Number(body?.expectedRevision);
    const adoptStrategyId =
      typeof body?.adoptStrategyId === 'string' ? body.adoptStrategyId.trim() : '';
    const patches = Array.isArray(body?.patches)
      ? body.patches
      : adoptStrategyId
        ? []
        : null;

    if (!seoVersionId || !Number.isFinite(expectedRevision) || !patches) {
      return jsonError(
        400,
        'invalid_input',
        'seoVersionId, expectedRevision og patches[] (eller adoptStrategyId) kræves'
      );
    }
    if (!patches.length && !adoptStrategyId) {
      return jsonError(
        400,
        'invalid_input',
        'Mindst én patch eller adoptStrategyId kræves'
      );
    }
    // Catch contract mix-ups early (regenerate payload must not land here)
    if (body?.fieldPath && !patches.length && !adoptStrategyId) {
      return jsonError(
        400,
        'invalid_input',
        'save-fields forventer patches[], ikke fieldPath (brug regenerate-field)'
      );
    }

    const version = await getSeoVersion(seoVersionId);
    if (!version) return jsonError(404, 'not_found', 'seoVersion findes ikke');
    try {
      assertOwnershipOrAdmin({ userId: auth.userId, createdBy: version.createdBy });
    } catch {
      return jsonError(403, 'forbidden', 'Ingen adgang');
    }

    const result = await saveFields({
      seoVersionId,
      expectedRevision,
      patches,
      userId: auth.userId,
      currentInput: body?.currentInput,
      adoptStrategyId: adoptStrategyId || undefined,
    });
    return NextResponse.json({
      ok: true,
      revision: result.revision,
      pack: result.pack,
    });
  } catch (e) {
    return mapPipelineError(e);
  }
}
