import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import {
  getOrCreateChatThread,
  readChatThreads,
  replyAsLiv,
} from '@/lib/accreditation/liv-chat';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const threadId = request.nextUrl.searchParams.get('threadId') || undefined;
  if (threadId) {
    const thread = await getOrCreateChatThread(threadId);
    return NextResponse.json(createSuccessResponse({ thread }, { requestId }));
  }
  return NextResponse.json(
    createSuccessResponse({ threads: (await readChatThreads()).slice(0, 12) }, { requestId })
  );
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const message = String(body.message || '').trim();
    if (!message) {
      return NextResponse.json(
        createErrorResponse('message er påkrævet', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }
    const result = await replyAsLiv({
      threadId: body.threadId ? String(body.threadId) : undefined,
      userMessage: message,
    });
    return NextResponse.json(createSuccessResponse(result, { requestId }));
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
