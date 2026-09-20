import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { runIngestToFirestore } from '@/lib/trending/ingest-runner';

export const maxDuration = 300;
export const runtime = 'nodejs';

/** Shared source ingestion, no AI calls, no deletion, no browser dependency. */
export async function GET(req: NextRequest) {
  const denied = requireCronBearer(req); if (denied) return denied;
  if (req.nextUrl.searchParams.has('dryRun')) return NextResponse.json({ status: 'dry_run_no_writes' });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: 'source_store_unavailable' }, { status: 503 });
  const ref = db.collection('livOperations').doc('source-refresh');
  const token = randomUUID(); const now = Date.now();
  try {
    const claimed = await db.runTransaction(async tx => {
      const row = (await tx.get(ref)).data();
      if (row?.leaseUntil > now || row?.nextAttemptAt > now) return false;
      tx.set(ref, { token, leaseUntil: now + 6 * 60_000, lastStartedAt: new Date(now).toISOString() }, { merge: true });
      return true;
    });
    if (!claimed) return NextResponse.json({ status: 'already_refreshed_or_running' });
    const metrics = await runIngestToFirestore({ sinceHrs: 72, limit: 20, maxDurationMs: 180_000 });
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).data()?.token !== token) throw new Error('source_refresh_lease_lost');
      tx.update(ref, { leaseUntil: 0, nextAttemptAt: Date.now() + 3_600_000,
        lastCompletedAt: new Date().toISOString(), metrics, status: 'completed' });
    });
    return NextResponse.json({ status: 'completed', metrics });
  } catch {
    // An expired lease permits a later idempotent URL upsert; never a paid replay.
    return NextResponse.json({ error: 'source_refresh_failed' }, { status: 503 });
  }
}
