import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { regenerateField } from '@/lib/seo-engine/pipeline';
import { jsonError, mapPipelineError } from '@/lib/seo-engine/http';
import { getAdminDb } from '@/lib/firebase-admin';
import { getSeoVersion } from '@/lib/seo-engine/store';
import { assertOwnershipOrAdmin, requireSeoEngineUser } from '@/lib/seo-engine/require-auth';

export async function POST(req: NextRequest) {
  if (!getAdminDb()) {
    return jsonError(503, 'fail_closed', 'Firestore er ikke konfigureret');
  }
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const seoVersionId = String(body?.seoVersionId || '');
    const fieldPath = String(body?.fieldPath || '');
    const expectedRevision = Number(body?.expectedRevision);
    if (!seoVersionId || !fieldPath || !Number.isFinite(expectedRevision)) {
      return jsonError(
        400,
        'invalid_input',
        'seoVersionId, fieldPath og expectedRevision kræves'
      );
    }
    const version = await getSeoVersion(seoVersionId);
    if (!version) return jsonError(404, 'not_found', 'seoVersion findes ikke');
    try {
      assertOwnershipOrAdmin({ userId: auth.userId, createdBy: version.createdBy });
    } catch {
      return jsonError(403, 'forbidden', 'Ingen adgang');
    }
    const result = await regenerateField({
      seoVersionId,
      fieldPath,
      expectedRevision,
      editorInstruction:
        typeof body?.editorInstruction === 'string' ? body.editorInstruction : undefined,
      userId: auth.userId,
      currentInput: body?.currentInput,
      forceDemo: body?.forceDemo === true || process.env.SEO_ENGINE_DEMO === 'true',
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return mapPipelineError(e);
  }
}
