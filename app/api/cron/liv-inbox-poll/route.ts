import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { syncLivInbox } from '@/lib/liv-inbox/imap-sync';
import { appendLivInboxAudit } from '@/lib/liv-inbox/audit-store';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Automatic Liv Indbakke ingestion: pull mail after the desk UID cursor
 * (never replay existing inbox history) and let Liv triage it.
 */
export async function GET(req: NextRequest) {
  const authFail = requireCronBearer(req);
  if (authFail) return authFail;

  try {
    const summary = await syncLivInbox({ limit: 30 });
    if (summary.configured) {
      await appendLivInboxAudit({
        type: 'poll',
        detail: `Auto-hentning: ${summary.processed} ny(e), ${summary.skipped} sprunget over`,
        meta: {
          processed: summary.processed,
          skipped: summary.skipped,
          scanned: summary.scanned,
          errors: summary.errors.length,
        },
      });
    }
    return NextResponse.json({ ok: summary.ok, summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
