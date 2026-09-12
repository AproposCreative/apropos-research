import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { reviseLivCover } from '@/lib/liv/cover-revision';

export const maxDuration = 300;
export async function POST(req: NextRequest) {
  const denied = requireCronBearer(req);
  if (denied) return denied;
  let input: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 8000) throw new Error('oversize');
    input = JSON.parse(raw);
  } catch { return NextResponse.json({ error: 'liv_cover_invalid' }, { status: 400 }); }
  try {
    return NextResponse.json(await reviseLivCover(input), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error && /^liv_cover_[a-z_]{1,60}$/.test(error.message) ? error.message : 'liv_cover_failed';
    return NextResponse.json({ error: code, publicationVerified: false }, { status: code.startsWith('liv_cover_invalid') ? 400 :
      ['liv_cover_store_unavailable', 'liv_cover_configuration'].includes(code) ? 503 : 409,
    headers: { 'Cache-Control': 'no-store' } });
  }
}
