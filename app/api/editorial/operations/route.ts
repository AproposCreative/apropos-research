import { NextRequest, NextResponse } from 'next/server';
import { verifyEditorialToken } from '@/lib/editorial-access';
import { readEditorialOperations } from '@/lib/editorial-operations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  const bearer = request.headers.get('authorization') || '';
  const access = bearer.startsWith('Bearer ') ? await verifyEditorialToken(bearer.slice(7)) : null;
  if (!access) return NextResponse.json({ error: 'Log ind med redaktionel adgang.' }, { status: 403, headers });
  try { return NextResponse.json(await readEditorialOperations(), { headers }); }
  catch { return NextResponse.json({ error: 'Driftsstatus kunne ikke hentes.' }, { status: 503, headers }); }
}
