import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { readCostActions } from '@/lib/ai/cost-actions';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  const access = await editorialRequestAccess(request);
  if (!access?.owner) return NextResponse.json({ error: 'Kun Frederik har adgang til forbrug.' }, { status: 403, headers });
  const month = request.nextUrl.searchParams.get('month') ?? undefined;
  if (month !== undefined && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: 'Ugyldig måned.' }, { status: 400, headers });
  }
  try { return NextResponse.json(await readCostActions(month), { headers }); }
  catch { return NextResponse.json({ error: 'Forbruget kunne ikke hentes.' }, { status: 503, headers }); }
}
