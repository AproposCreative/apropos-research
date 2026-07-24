import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  assertArchiveApplySelectionGates,
  generateArchiveApplyPreview,
  normalizeArchiveApplySelection,
} from '@/lib/seo-engine/archive-audit-apply';
import { jsonError, mapPipelineError } from '@/lib/seo-engine/http';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireSeoEngineUser, requireSeoEngineAdmin } from '@/lib/seo-engine/require-auth';

export const maxDuration = 300;

/**
 * POST /api/seo-engine/archive-audit/preview
 * Generate frozen SEO+meta overwrite proposals for selected archive rows.
 * Admin-only. No CMS writes.
 * Body: { selection: Array<{ itemId, locale }> }
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
      return jsonError(403, 'forbidden', 'Kun admin kan preview-anvende arkiv-SEO');
    }

    const body = await req.json().catch(() => ({}));
    const normalized = normalizeArchiveApplySelection(body?.selection);
    if (normalized.ok === false) {
      return jsonError(400, 'invalid_input', normalized.reason);
    }
    const gate = assertArchiveApplySelectionGates(normalized.selection);
    if (gate.ok === false) {
      return jsonError(400, 'invalid_input', gate.reason);
    }

    const preview = await generateArchiveApplyPreview({
      selection: normalized.selection,
      createdBy: auth.userId,
    });

    return NextResponse.json({
      ok: true,
      previewId: preview.previewId,
      confirmToken: preview.confirmToken,
      expiresAt: preview.expiresAt,
      stoppedOnError: preview.stoppedOnError,
      errorMessage: preview.errorMessage,
      proposalCount: preview.proposals.length,
      rejectedCount: preview.rejected.length,
      proposals: preview.proposals,
      rejected: preview.rejected,
      selection: preview.selection,
      note: 'Ingen CMS-skrivning. Bekræft med confirmOverwrite + confirmToken for at anvende.',
    });
  } catch (e) {
    return mapPipelineError(e);
  }
}
