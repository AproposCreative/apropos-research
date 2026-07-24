import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runArchiveAudit, type ArchiveAuditLocale } from '@/lib/seo-engine/archive-audit';
import { jsonError, mapPipelineError } from '@/lib/seo-engine/http';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireSeoEngineUser, requireSeoEngineAdmin } from '@/lib/seo-engine/require-auth';

export const maxDuration = 300;

/**
 * POST /api/seo-engine/archive-audit
 * Read-only archive scan. Admin-gated. No CMS writes.
 * Body: { limit?, locales?, measurementWindowDays? }
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
      return jsonError(403, 'forbidden', 'Kun admin kan køre arkiv-audit');
    }

    const body = await req.json().catch(() => ({}));
    const limit = typeof body?.limit === 'number' ? Math.max(1, Math.min(1000, body.limit)) : 80;
    const locales = Array.isArray(body?.locales)
      ? (body.locales.filter((l: unknown) => l === 'da' || l === 'en') as ArchiveAuditLocale[])
      : undefined;
    const measurementWindowDays =
      typeof body?.measurementWindowDays === 'number' ? body.measurementWindowDays : 28;

    const report = await runArchiveAudit({
      limit,
      locales,
      measurementWindowDays,
    });

    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return mapPipelineError(e);
  }
}
