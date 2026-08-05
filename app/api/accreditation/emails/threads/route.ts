import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createSuccessResponse } from '@/lib/api/types';
import { readEmailThreads } from '@/lib/accreditation/email-thread-store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  return NextResponse.json(
    createSuccessResponse({ threads: await readEmailThreads() }, { requestId })
  );
}
