import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { buildAccreditationDraft } from '@/lib/accreditation/draft-template';
import { researchAccreditationContact } from '@/lib/accreditation/research';
import type { AccreditationRequest } from '@/lib/accreditation/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const artist = String(body.artist || '').trim();
    const eventUrl = String(body.eventUrl || '').trim();
    const recipientName = String(body.recipientName || '').trim();
    const recipientEmail = String(body.recipientEmail || '').trim().toLowerCase();

    if (!artist || !eventUrl || !recipientName || !recipientEmail.includes('@')) {
      return NextResponse.json(
        createErrorResponse('Event og skribent skal være udfyldt', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const transientRequest: AccreditationRequest = {
      id: `PREVIEW-${requestId.slice(0, 12)}`,
      artist,
      venue: String(body.venue || '').trim() || undefined,
      eventDate: String(body.eventDate || '').trim() || undefined,
      applicants: [{ name: recipientName, email: recipientEmail }],
      deliveryRecipientName: recipientName,
      deliveryRecipientEmail: recipientEmail,
      sourceEventUrl: eventUrl,
      accessRequested: `${String(body.ticketType || 'presse')} / presseakkreditering`,
      ticketType: String(body.ticketType || 'presse'),
      ticketQuantity: Math.max(1, Number(body.ticketQuantity) || 1),
      promoter: String(body.promoter || '').trim() || undefined,
      senderMailbox: 'liv@aproposmagazine.com',
      status: 'researching',
      createdAt: now,
      updatedAt: now,
    };

    const research = await researchAccreditationContact(transientRequest);
    const enrichedRequest: AccreditationRequest = {
      ...transientRequest,
      contactName: research.contactName,
      contactEmail: research.contactEmail,
      promoter: research.promoter || transientRequest.promoter,
      contactConfidence: research.contactConfidence,
      previousCoverageUrl: research.previousCoverageUrl,
    };
    const draft = buildAccreditationDraft({
      request: enrichedRequest,
      contactName: research.contactName,
      previousCoverageUrl: research.previousCoverageUrl,
    });

    return NextResponse.json(
      createSuccessResponse(
        {
          research: {
            contactName: research.contactName || null,
            contactEmail: research.contactEmail || null,
            promoter: research.promoter || null,
            contactConfidence: research.contactConfidence,
            ambiguous: research.ambiguous,
            previousCoverageUrl: research.previousCoverageUrl || null,
            sources: research.sources.slice(0, 5),
            historyMatched:
              /historik|etableret tovejs|persistent kontakt-hukommelse/i.test(research.notes),
          },
          plan: {
            subject: draft.subject,
            text: draft.text,
            followUp: 'Liv følger op efter 3 dage, hvis der ikke kommer svar.',
            delivery: `Svar og eventuelle billetter samles og sendes til ${recipientName}.`,
          },
        },
        { requestId }
      )
    );
  } catch (caught) {
    return NextResponse.json(
      createErrorResponse(
        caught instanceof Error ? caught.message : 'Research kunne ikke gennemføres',
        {
          statusCode: 500,
          errorCode: ErrorCode.INTERNAL_ERROR,
          requestId,
        }
      ),
      { status: 500 }
    );
  }
}
