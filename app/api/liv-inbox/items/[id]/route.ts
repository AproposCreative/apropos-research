import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { getInboxItem, updateInboxItem } from '@/lib/liv-inbox/inbox-store';
import { rememberSentReply } from '@/lib/liv-inbox/context';
import { appendLivInboxAudit } from '@/lib/liv-inbox/audit-store';
import { sanitizeLivOutput } from '@/lib/accreditation/sanitize';

export const runtime = 'nodejs';

/**
 * Human actions on an inbox item:
 *  - approve_send: accept Liv's draft (records it as sent)
 *  - dismiss:      drop the item
 *  - update_draft: edit Liv's draft reply before sending
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  const { id } = await ctx.params;
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '').trim();

    const existing = await getInboxItem(id);
    if (!existing) {
      return NextResponse.json(
        createErrorResponse('Fandt ikke indbakke-elementet.', {
          statusCode: 404,
          errorCode: ErrorCode.NOT_FOUND,
          requestId,
        }),
        { status: 404 }
      );
    }

    if (action === 'update_draft') {
      const draftReply = sanitizeLivOutput(String(body.draftReply || '').trim());
      const item = await updateInboxItem(id, { draftReply });
      await appendLivInboxAudit({
        type: 'edited',
        itemId: id,
        contactEmail: existing.fromEmail,
        subject: existing.subject,
        detail: 'Kladde redigeret manuelt',
      });
      return NextResponse.json(createSuccessResponse({ item }, { requestId }));
    }

    if (action === 'approve_send') {
      const draftReply = body.draftReply
        ? sanitizeLivOutput(String(body.draftReply).trim())
        : existing.draftReply;
      const item = await updateInboxItem(id, {
        draftReply,
        status: 'sent',
        needsHuman: false,
        handledAt: new Date().toISOString(),
      });
      if (item && draftReply) {
        await rememberSentReply({
          email: item.fromEmail,
          name: item.fromName,
          subject: item.subject,
          replyBlurb: draftReply,
        });
      }
      await appendLivInboxAudit({
        type: 'sent',
        itemId: id,
        contactEmail: existing.fromEmail,
        subject: existing.subject,
        detail: 'Godkendt og markeret sendt',
      });
      return NextResponse.json(createSuccessResponse({ item }, { requestId }));
    }

    if (action === 'dismiss') {
      const item = await updateInboxItem(id, {
        status: 'dismissed',
        handledAt: new Date().toISOString(),
      });
      await appendLivInboxAudit({
        type: 'dismissed',
        itemId: id,
        contactEmail: existing.fromEmail,
        subject: existing.subject,
        detail: 'Afvist manuelt',
      });
      return NextResponse.json(createSuccessResponse({ item }, { requestId }));
    }

    return NextResponse.json(
      createErrorResponse('action: approve_send|dismiss|update_draft', {
        statusCode: 400,
        errorCode: ErrorCode.INVALID_REQUEST,
        requestId,
      }),
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      createErrorResponse(e instanceof Error ? e.message : 'Failed', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
