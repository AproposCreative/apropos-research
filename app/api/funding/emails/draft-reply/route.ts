import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { getThreadById } from '@/lib/funding/email-thread-store';
import { summarizeInboundEmail } from '@/lib/funding/summarize-inbound';
import { getOpenAIClient, models } from '@/lib/openai';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const threadId = body.threadId as string | undefined;
    const purpose = (body.purpose as string | undefined) || 'first_outreach';

    if (!threadId) {
      return NextResponse.json(
        createErrorResponse('threadId is required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    const thread = getThreadById(threadId);
    if (!thread) {
      return NextResponse.json(
        createErrorResponse('Thread not found', { statusCode: 404, errorCode: ErrorCode.NOT_FOUND, requestId }),
        { status: 404 }
      );
    }

    const lastInbound = [...thread.messages].reverse().find((m) => m.direction === 'inbound');
    if (lastInbound) {
      const { aiSummary, suggestedReply } = await summarizeInboundEmail({
        subject: lastInbound.subject,
        from: lastInbound.from,
        text: lastInbound.text || lastInbound.html?.replace(/<[^>]+>/g, ' ') || '',
        thread,
      });
      return NextResponse.json(createSuccessResponse({ draft: suggestedReply, aiSummary }, { requestId }));
    }

    const openai = getOpenAIClient();
    const fallback =
      purpose === 'follow_up'
        ? 'Hej,\n\nVi følger op på vores tidligere henvendelse vedr. støtte til Apropos Magazine. Kan I bekræfte om vi er relevante ansøgere, og hvilke bilag I forventer?\n\nVenlig hilsen\nApropos Magazine'
        : 'Hej,\n\nVi skriver fra Apropos Magazine — et digitalt kulturmagasin med fokus på musik, film/TV, gaming og kulturjournalistik. Vi undersøger om jeres pulje/program er relevant for os, og hvilke krav og frister der gælder.\n\nKan I pege os til den rette ansøgningsvejledning?\n\nVenlig hilsen\nApropos Magazine';

    if (!openai) {
      return NextResponse.json(createSuccessResponse({ draft: fallback }, { requestId }));
    }

    const completion = await openai.chat.completions.create({
      model: models.default,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'Skriv en kort, professionel funding-mail på dansk fra Apropos Magazine. Ingen opdigtede fakta. Formål: forespørgsel eller opfølgning.',
        },
        {
          role: 'user',
          content: `Formål: ${purpose}\nEmne/tråd: ${thread.subject}\nModtager: ${thread.contactEmail}\nSkriv kun mailbrødtekst.`,
        },
      ],
    });

    const draft = completion.choices[0]?.message?.content?.trim() || fallback;
    return NextResponse.json(createSuccessResponse({ draft }, { requestId }));
  } catch (error) {
    return NextResponse.json(
      createErrorResponse(error instanceof Error ? error.message : 'Draft failed', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
