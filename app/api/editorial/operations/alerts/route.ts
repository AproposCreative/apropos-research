import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { readDeliveryAlertHistory } from '@/lib/liv/alert-status';
import { validDay } from '@/lib/liv/delivery-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  if (!(await editorialRequestAccess(request))?.owner) return NextResponse.json({ error: 'Kun Frederik har adgang til drift.' }, { status: 403, headers });
  const params = request.nextUrl.searchParams;
  const cursor = params.get('cursor') ?? undefined;
  if ([...params.keys()].some(key => key !== 'cursor') || params.getAll('cursor').length > 1 || (cursor !== undefined && !validDay(cursor))) {
    return NextResponse.json({ error: 'Ugyldig side.' }, { status: 400, headers });
  }
  try { return NextResponse.json(await readDeliveryAlertHistory(cursor), { headers }); }
  catch { return NextResponse.json({ error: 'Alarmhistorikken kunne ikke hentes.' }, { status: 503, headers }); }
}
