import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { pollMailbox } from '@/lib/accreditation/imap/poll';
import type { MailboxId } from '@/lib/accreditation/imap/config';

export const runtime = 'nodejs';
export const maxDuration = 120;

async function runPoll(mailbox: MailboxId | 'liv_only' = 'liv_only') {
  if (mailbox === 'liv_only' || mailbox === 'liv') {
    return { liv: await pollMailbox('liv') };
  }
  return {
    liv: await pollMailbox('liv'),
    frederik: await pollMailbox('frederik', { limit: 20 }),
  };
}

/** Cron + authenticated poll of one.com IMAP (Liv production ingestion). */
export async function GET(req: NextRequest) {
  const authFail = requireCronBearer(req);
  if (authFail) return authFail;
  try {
    const result = await runPoll('liv_only');
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  // Authentication is already enforced by middleware. The bearer may be either
  // CRON_SECRET or a valid Firebase ID token from the Studio UI.
  try {
    const body = await req.json().catch(() => ({}));
    const mailbox = (body.mailbox as MailboxId | 'liv_only') || 'liv_only';
    const result = await runPoll(mailbox);
    return NextResponse.json(createSuccessResponse(result, { requestId }));
  } catch (e) {
    return NextResponse.json(
      createErrorResponse(e instanceof Error ? e.message : 'Poll failed', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
