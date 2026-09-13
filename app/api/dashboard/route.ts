import { NextRequest, NextResponse } from 'next/server';
import { buildDashboardData } from '@/lib/dashboard/build-data';
import { parseDashboardPeriod } from '@/lib/dashboard/period';
import { editorialRequestAccess } from '@/lib/editorial-access';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const access = await editorialRequestAccess(req);
  if (!access) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  const period = parseDashboardPeriod(req.nextUrl.searchParams.get('period'));

  try {
    const data = await buildDashboardData(period, access.owner);
    return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'Dashboard kunne ikke hentes.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
