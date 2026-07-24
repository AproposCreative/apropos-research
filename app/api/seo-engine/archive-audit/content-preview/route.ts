import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  generateContentFixPreview,
  assertContentApplySelectionGates,
} from '@/lib/seo-engine/archive-content-apply';
import { normalizeArchiveApplySelection } from '@/lib/seo-engine/archive-audit-apply';
import { normalizeFixKinds } from '@/lib/seo-engine/archive-content-fixes';
import { jsonError, mapPipelineError } from '@/lib/seo-engine/http';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireSeoEngineUser, requireSeoEngineAdmin } from '@/lib/seo-engine/require-auth';

export const maxDuration = 300;

/**
 * POST /api/seo-engine/archive-audit/content-preview
 * Frozen proposals for internal links / headings / canonical. No CMS writes.
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
      return jsonError(403, 'forbidden', 'Kun admin kan preview-anvende arkiv-indhold');
    }

    const body = await req.json().catch(() => ({}));
    const normalized = normalizeArchiveApplySelection(body?.selection);
    if (normalized.ok === false) {
      return jsonError(400, 'invalid_input', normalized.reason);
    }
    const kinds = normalizeFixKinds(body?.kinds);
    if (kinds.ok === false) {
      return jsonError(400, 'invalid_input', kinds.reason);
    }
    const gate = assertContentApplySelectionGates(normalized.selection);
    if (gate.ok === false) {
      return jsonError(400, 'invalid_input', gate.reason);
    }

    const preview = await generateContentFixPreview({
      selection: normalized.selection,
      kinds: kinds.kinds,
      createdBy: auth.userId,
    });

    return NextResponse.json({
      ok: true,
      previewId: preview.previewId,
      confirmToken: preview.confirmToken,
      expiresAt: preview.expiresAt,
      stoppedOnError: preview.stoppedOnError,
      errorMessage: preview.errorMessage,
      kinds: preview.kinds,
      proposalCount: preview.proposals.length,
      rejectedCount: preview.rejected.length,
      proposals: preview.proposals.map((p) => ({
        itemId: p.itemId,
        locale: p.locale,
        title: p.title,
        slug: p.slug,
        kinds: p.kinds,
        contentChanged: p.contentChanged,
        canonicalChanged: p.canonicalChanged,
        thumbAltChanged: p.thumbAltChanged,
        oldCanonical: p.oldCanonical,
        newCanonical: p.newCanonical,
        oldThumbAlt: p.oldThumbAlt,
        newThumbAlt: p.newThumbAlt,
        links: p.links,
        headings: p.headings,
        oldContentExcerpt: p.oldContent.slice(0, 280),
        newContentExcerpt: p.newContent.slice(0, 280),
      })),
      rejected: preview.rejected,
      note: 'Ingen CMS-skrivning. Bekræft med confirmOverwrite + confirmToken.',
    });
  } catch (e) {
    return mapPipelineError(e);
  }
}
