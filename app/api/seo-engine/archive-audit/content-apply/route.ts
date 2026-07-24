import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { applyContentFixPreview } from '@/lib/seo-engine/archive-content-apply';
import { jsonError, mapPipelineError } from '@/lib/seo-engine/http';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireSeoEngineUser, requireSeoEngineAdmin } from '@/lib/seo-engine/require-auth';

export const maxDuration = 300;

/**
 * POST /api/seo-engine/archive-audit/content-apply
 * Apply frozen content preview: backup → patch content / canonical-url → readback.
 */
export async function POST(req: NextRequest) {
  try {
    if (!getAdminDb()) {
      return jsonError(503, 'fail_closed', 'Firebase er ikke konfigureret');
    }
    const auth = await requireSeoEngineUser(req);
    if (!auth.ok) return auth.response;
    try {
      requireSeoEngineAdmin(auth.userId);
    } catch {
      return jsonError(403, 'forbidden', 'Kun admin kan anvende arkiv-indhold');
    }

    const body = await req.json().catch(() => ({}));
    const previewId = typeof body?.previewId === 'string' ? body.previewId.trim() : '';
    const confirmToken = typeof body?.confirmToken === 'string' ? body.confirmToken.trim() : '';
    const confirmOverwrite = body?.confirmOverwrite === true;

    if (!previewId) return jsonError(400, 'invalid_input', 'previewId er påkrævet');
    if (!confirmOverwrite) {
      return jsonError(400, 'invalid_input', 'confirmOverwrite=true er påkrævet');
    }
    if (!confirmToken) return jsonError(400, 'invalid_input', 'confirmToken er påkrævet');

    const result = await applyContentFixPreview({
      previewId,
      confirmOverwrite,
      confirmToken,
    });

    return NextResponse.json({
      ok: !result.stoppedOnError,
      previewId: result.previewId,
      writtenCount: result.writtenCount,
      stoppedOnError: result.stoppedOnError,
      errorMessage: result.errorMessage || null,
      backupPath: result.backupPath,
      backupDocId: result.backupDocId,
      autoTranslatePaused: result.autoTranslatePaused,
      autoTranslateRestored: result.autoTranslateRestored,
      note: 'content + canonical-url. Publiceret status bevaret. Stop-on-error.',
    });
  } catch (e) {
    return mapPipelineError(e);
  }
}
