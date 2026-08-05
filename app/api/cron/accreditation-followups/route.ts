import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { sendDueFollowUps } from '@/lib/accreditation/orchestrator';
import { isAgentPaused } from '@/lib/accreditation/agent-control';
import { releaseLease, tryAcquireLease } from '@/lib/accreditation/persistence/leases';
import { randomUUID } from 'crypto';

export const maxDuration = 120;
export const runtime = 'nodejs';

/** Auto follow-ups for unanswered accreditation outreach. */
export async function GET(req: NextRequest) {
  const authFail = requireCronBearer(req);
  if (authFail) return authFail;

  const holderId = randomUUID();
  const leaseId = 'cron:accreditation-followups';
  const lease = await tryAcquireLease({ leaseId, holderId });
  if (!lease.acquired) {
    return NextResponse.json({ ok: true, skipped: true, reason: lease.reason || 'lease held' });
  }

  try {
    if (await isAgentPaused()) {
      return NextResponse.json({ ok: true, paused: true, sent: 0, skipped: 0 });
    }

    const result = await sendDueFollowUps();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  } finally {
    await releaseLease(leaseId, holderId);
  }
}
