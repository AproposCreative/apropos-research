import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { readDeliveryState } from '@/lib/liv/delivery-store';
import { copenhagenClock, isPublicationDay, validDay } from '@/lib/liv/delivery-policy';
import { readDeliveryAlertContext, renderDeliveryAlert } from '@/lib/liv/delivery-alert-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

/** Owner-only, read-only handoff. Does not send mail or invoke a worker. */
export async function GET(req: NextRequest) {
  if (!(await editorialRequestAccess(req))?.owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  const now = new Date();
  const today = copenhagenClock(now);
  const day = req.nextUrl.searchParams.get('day') || today.day;
  if (!validDay(day) || day > today.day || !isPublicationDay(day) || day === today.day && today.hour < 10) {
    return NextResponse.json({ error: 'Vælg en forfalden udgivelsesdato.' }, { status: 400, headers });
  }
  try {
    const state = await readDeliveryState();
    const context = await readDeliveryAlertContext(state, day, now);
    const kind = context.published ? 'resolved' : day < today.day || today.hour >= 20 ? 'finalFailure' : 'failure';
    return NextResponse.json({ preview: true, context, ...renderDeliveryAlert(kind, context) }, { headers });
  } catch { return NextResponse.json({ error: 'Overdragelsen kunne ikke læses. Ingen handling startet.' }, { status: 503, headers }); }
}
