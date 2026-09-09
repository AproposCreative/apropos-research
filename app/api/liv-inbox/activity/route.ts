import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createSuccessResponse } from '@/lib/api/types';
import { listLivInboxAudit } from '@/lib/liv-inbox/audit-store';

export const runtime = 'nodejs';

/** Recent audit timeline for Liv Indbakke (what she did and when). */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const events = await listLivInboxAudit(40);
  return NextResponse.json(createSuccessResponse({ events }, { requestId }));
}
