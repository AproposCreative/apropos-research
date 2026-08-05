import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { appendAudit } from '@/lib/accreditation/audit-store';
import { extractEventFromUrl } from '@/lib/accreditation/event-url';
import { runAutonomousPipeline } from '@/lib/accreditation/orchestrator';
import { createRequest, updateRequest } from '@/lib/accreditation/request-store';

export const runtime = 'nodejs';

/**
 * First-class UI intake: event URL + recipient + quantity/access → extract → create → pipeline.
 */
export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const eventUrl = String(body.eventUrl || body.url || '').trim();
    const recipientEmail = String(body.recipientEmail || '').trim().toLowerCase();
    const recipientName = String(body.recipientName || '').trim();
    const quantity = body.ticketQuantity != null ? Number(body.ticketQuantity) : 1;
    const accessType = String(body.ticketType || body.accessType || 'presse').trim();
    const accessRequested = String(body.accessRequested || '').trim();
    const runPipeline = body.runPipeline !== false;
    const previewOnly = body.previewOnly === true;

    if (!eventUrl) {
      return NextResponse.json(
        createErrorResponse('eventUrl er påkrævet', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }
    const extracted = await extractEventFromUrl(eventUrl);
    const artist = String(body.artist || extracted.artist || '').trim();
    if (!artist) {
      return NextResponse.json(
        createErrorResponse('Kunne ikke finde artist/event på siden', {
          statusCode: 422,
          errorCode: ErrorCode.INVALID_REQUEST,
          requestId,
        }),
        { status: 422 }
      );
    }
    if (previewOnly) {
      return NextResponse.json(
        createSuccessResponse(
          {
            extracted: {
              ...extracted,
              artist,
              venue: body.venue ? String(body.venue) : extracted.venue,
              eventDate: body.eventDate ? String(body.eventDate) : extracted.eventDate,
            },
          },
          { requestId }
        )
      );
    }
    if (!recipientEmail || !recipientEmail.includes('@')) {
      return NextResponse.json(
        createErrorResponse('recipientEmail er påkrævet', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    const created = await createRequest({
      artist,
      venue: body.venue ? String(body.venue) : extracted.venue,
      eventDate: body.eventDate ? String(body.eventDate) : extracted.eventDate,
      applicants: [
        {
          name: recipientName || recipientEmail,
          email: recipientEmail,
        },
      ],
      accessRequested: accessRequested || `${accessType} / presseakkreditering`,
      notes: `UI URL intake: ${extracted.url}`,
    });

    await updateRequest(created.id, {
      ticketType: accessType,
      ticketQuantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      sourceEventUrl: extracted.url,
      deliveryRecipientName: recipientName || recipientEmail,
      deliveryRecipientEmail: recipientEmail,
      promoter: body.promoter ? String(body.promoter) : extracted.promoter,
      contactName: body.contactName ? String(body.contactName) : extracted.contactName,
      contactEmail: body.contactEmail ? String(body.contactEmail) : extracted.contactEmail,
      contactConfidence: extracted.contactEmail ? 'medium' : 'low',
      researchNotes: extracted.notes,
    });

    await appendAudit({
      requestId: created.id,
      type: 'url_intake',
      detail: `URL intake ${extracted.url} → ${artist}`,
      meta: {
        recipientEmail,
        confidence: extracted.confidence,
      },
    });

    let pipeline: { ok: boolean; detail: string } | null = null;
    if (runPipeline) {
      pipeline = await runAutonomousPipeline(created.id);
    }

    return NextResponse.json(
      createSuccessResponse(
        {
          request: created.id,
          extracted,
          pipeline,
        },
        { requestId }
      )
    );
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Failed';
    const friendly =
      /aborted|timeout|timed out|svarede ikke i tide/i.test(raw)
        ? 'Event-siden svarede ikke i tide. Prøv igen — eller ret artist/venue manuelt efter slug-forslag.'
        : raw;
    return NextResponse.json(
      createErrorResponse(friendly, {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
