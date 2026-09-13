import { NextRequest, NextResponse } from 'next/server';
import { verifyEditorialToken } from '@/lib/editorial-access';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  const access = header.startsWith('Bearer ') ? await verifyEditorialToken(header.slice(7)) : null;
  return NextResponse.json(access ? { allowed: true, role: access.role } : { allowed: false },
    { status: access ? 200 : 403, headers: { 'Cache-Control': 'no-store' } });
}
