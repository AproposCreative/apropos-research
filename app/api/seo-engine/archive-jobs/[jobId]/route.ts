import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { applyArchiveJob, previewArchiveJob } from '@/lib/seo-engine/archive-job-runner';
import { dismissArchiveJob, getArchiveJob, saveArchiveJob } from '@/lib/seo-engine/archive-job-store';
import type { ArchiveJob, ArchiveJobTaskKind } from '@/lib/seo-engine/archive-jobs';
import { jsonError, mapPipelineError } from '@/lib/seo-engine/http';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireSeoEngineAdmin, requireSeoEngineUser } from '@/lib/seo-engine/require-auth';

export const maxDuration = 300;

type Ctx = { params: Promise<{ jobId: string }> };

async function requireAdmin(req: NextRequest) {
  if (!getAdminDb()) {
    return { ok: false as const, response: jsonError(503, 'fail_closed', 'Firebase er ikke konfigureret') };
  }
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth;
  try {
    requireSeoEngineAdmin(auth.userId);
  } catch {
    return { ok: false as const, response: jsonError(403, 'forbidden', 'Kun admin') };
  }
  return auth;
}

/**
 * GET /api/seo-engine/archive-jobs/[jobId]
 * POST body.action: preview | apply | dismiss
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
    const { jobId } = await ctx.params;
    const job = await getArchiveJob(decodeURIComponent(jobId));
    if (!job) return jsonError(404, 'not_found', 'Job ikke fundet');
    return NextResponse.json({ ok: true, job });
  } catch (e) {
    return mapPipelineError(e);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
    const { jobId } = await ctx.params;
    const id = decodeURIComponent(jobId);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'preview');

    let job = await getArchiveJob(id);
    if (!job && body?.job) {
      // Allow Løs from scan response before Firestore roundtrip
      job = body.job as ArchiveJob;
      if (job) await saveArchiveJob(job).catch(() => undefined);
    }
    if (!job) return jsonError(404, 'not_found', 'Job ikke fundet — kør Scan igen');

    if (action === 'dismiss') {
      const next = await dismissArchiveJob(id);
      return NextResponse.json({ ok: true, job: next });
    }

    if (action === 'preview') {
      const kinds = Array.isArray(body?.kinds) ? (body.kinds as ArchiveJobTaskKind[]) : null;
      const preview = await previewArchiveJob({ job, kinds });
      return NextResponse.json({
        ok: true,
        preview,
        note: 'Ingen CMS-skrivning endnu. Bekræft med action=apply + confirmToken.',
      });
    }

    if (action === 'apply') {
      const result = await applyArchiveJob({
        job,
        confirmToken: String(body?.confirmToken || ''),
        confirmOverwrite: body?.confirmOverwrite === true,
      });
      return NextResponse.json({
        ok: result.written,
        written: result.written,
        job: result.job,
        error: result.error || null,
        badge: result.job
          ? undefined
          : null,
      });
    }

    return jsonError(400, 'invalid_input', 'Ukendt action');
  } catch (e) {
    return mapPipelineError(e);
  }
}
