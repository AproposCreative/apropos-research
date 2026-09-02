import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createSuccessResponse } from '@/lib/api/types';
import { listInboxItems } from '@/lib/liv-inbox/inbox-store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const items = await listInboxItems();
  const counts = {
    total: items.length,
    escalated: items.filter((i) => i.status === 'escalated').length,
    draft: items.filter((i) => i.status === 'draft').length,
    autoReplied: items.filter((i) => i.status === 'auto_replied').length,
    sent: items.filter((i) => i.status === 'sent').length,
  };
  return NextResponse.json(createSuccessResponse({ items, counts }, { requestId }));
}
