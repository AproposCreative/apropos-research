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

  const withConfidence = items.filter((i) => typeof i.confidence === 'number');
  const active = items.filter((i) => i.status !== 'dismissed');
  const metrics = {
    handled: items.length,
    avgConfidence: withConfidence.length
      ? Math.round(withConfidence.reduce((a, i) => a + (i.confidence || 0), 0) / withConfidence.length)
      : null,
    escalationRate: active.length
      ? Math.round((active.filter((i) => i.status === 'escalated').length / active.length) * 100)
      : 0,
    knownContacts: items.filter((i) => i.contactKnown).length,
  };

  return NextResponse.json(createSuccessResponse({ items, counts, metrics }, { requestId }));
}
