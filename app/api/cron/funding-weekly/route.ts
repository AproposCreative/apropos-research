import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { discoverOpportunities } from '@/lib/funding/engine';
import { markExpiredDeadlines, readStoredOpportunities } from '@/lib/funding/opportunity-store';
import { countThreadsAwaitingReply } from '@/lib/funding/email-thread-store';

export const maxDuration = 300;

/**
 * Ugentlig funding-radar: opdater muligheder og markér udløbne frister.
 */
export async function GET(req: NextRequest) {
  const authFail = requireCronBearer(req);
  if (authFail) return authFail;

  try {
    const discovered = await discoverOpportunities({ limit: 12, mergeStored: true });
    const expired = markExpiredDeadlines();
    const stored = readStoredOpportunities();
    const staleThreads = countThreadsAwaitingReply(7);

    return NextResponse.json({
      ok: true,
      discoveredCount: discovered.length,
      storedCount: stored.length,
      expiredMarked: expired,
      threadsAwaitingReplyOver7d: staleThreads,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
