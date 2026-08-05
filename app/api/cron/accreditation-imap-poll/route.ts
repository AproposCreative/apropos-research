import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { pollMailbox } from '@/lib/accreditation/imap/poll';
import { getMailboxPublicConfig } from '@/lib/accreditation/imap/config';
import { releaseLease, tryAcquireLease } from '@/lib/accreditation/persistence/leases';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Production IMAP ingestion for Liv plus safe writer requests sent to Frederik. */
export async function GET(req: NextRequest) {
  const authFail = requireCronBearer(req);
  if (authFail) return authFail;

  const holderId = randomUUID();
  const leaseId = 'cron:accreditation-imap-poll';
  const lease = await tryAcquireLease({ leaseId, holderId });
  if (!lease.acquired) {
    return NextResponse.json({ ok: true, skipped: true, reason: lease.reason || 'lease held' });
  }

  try {
    const liv = await pollMailbox('liv', { limit: 50 });
    const frederik = getMailboxPublicConfig('frederik').passwordConfigured
      ? await pollMailbox('frederik', { limit: 50 })
      : null;
    return NextResponse.json({ ok: true, liv, frederik });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  } finally {
    await releaseLease(leaseId, holderId);
  }
}
