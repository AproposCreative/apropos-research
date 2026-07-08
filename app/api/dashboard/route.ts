import { NextRequest, NextResponse } from 'next/server';
import { buildDashboardData } from '@/lib/dashboard/build-data';
import { parseDashboardPeriod } from '@/lib/dashboard/period';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  const period = parseDashboardPeriod(req.nextUrl.searchParams.get('period'));

  try {
    const data = await buildDashboardData(period);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ukendt fejl';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
