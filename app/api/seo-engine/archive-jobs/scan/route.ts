import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runArchiveAudit } from '@/lib/seo-engine/archive-audit';
import { buildArchiveJobsFromRows, jobMatchesTab } from '@/lib/seo-engine/archive-jobs';
import { listArchiveJobs, upsertArchiveJobs } from '@/lib/seo-engine/archive-job-store';
import { jsonError, mapPipelineError } from '@/lib/seo-engine/http';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireSeoEngineAdmin, requireSeoEngineUser } from '@/lib/seo-engine/require-auth';

export const maxDuration = 300;

/**
 * POST /api/seo-engine/archive-jobs/scan
 * Scan arkiv → upsert impact jobs (skips EN 404 noise).
 * GET  /api/seo-engine/archive-jobs/scan?tab=open|running|done — list jobs
 */
export async function GET(req: NextRequest) {
  try {
    if (!getAdminDb()) {
      return jsonError(503, 'fail_closed', 'Firebase er ikke konfigureret');
    }
    const auth = await requireSeoEngineUser(req);
    if (!auth.ok) return auth.response;
    try {
      requireSeoEngineAdmin(auth.userId);
    } catch {
      return jsonError(403, 'forbidden', 'Kun admin');
    }

    const tab = (req.nextUrl.searchParams.get('tab') || 'open') as
      | 'open'
      | 'running'
      | 'done';
    const limit = Number(req.nextUrl.searchParams.get('limit') || 120);
    const all = await listArchiveJobs({ limit: 500 });
    const counts = {
      open: all.filter((j) => jobMatchesTab(j, 'open')).length,
      running: all.filter((j) => jobMatchesTab(j, 'running')).length,
      done: all.filter((j) => jobMatchesTab(j, 'done')).length,
    };
    const jobs = all.filter((j) => jobMatchesTab(j, tab)).slice(0, limit);
    return NextResponse.json({
      ok: true,
      tab,
      jobs,
      counts,
    });
  } catch (e) {
    return mapPipelineError(e);
  }
}

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
      return jsonError(403, 'forbidden', 'Kun admin kan scanne arkiv-kø');
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(500, Math.max(20, Number(body?.limit) || 80));
    const report = await runArchiveAudit({ limit });
    const { jobs, skipped } = buildArchiveJobsFromRows(report.rows || []);
    let written = 0;
    try {
      written = await upsertArchiveJobs(jobs);
    } catch (err) {
      // Still return jobs for UI even if Firestore write fails (local/dev)
      console.warn('[archive-jobs/scan] upsert failed', err);
    }

    return NextResponse.json({
      ok: true,
      scanned: report.scanned,
      jobCount: jobs.length,
      skippedNoise: skipped,
      written,
      jobs: jobs.slice(0, 120),
      summary: report.summary,
      note: 'EN 404 / fetch-fejl er skjult fra standardkøen',
    });
  } catch (e) {
    return mapPipelineError(e);
  }
}
