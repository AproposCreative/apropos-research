import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { reviseLivPresentation } from '@/lib/liv/presentation-revision';
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  const denied = requireCronBearer(req); if (denied) return denied;
  let input: unknown;
  try { const raw = await req.text(); if (raw.length > 6000) throw new Error(); input = JSON.parse(raw); }
  catch { return NextResponse.json({ error: 'liv_presentation_invalid' }, { status: 400 }); }
  try { return NextResponse.json(await reviseLivPresentation(input), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error && /^liv_presentation_[a-z_]+$/.test(e.message) ? e.message : 'liv_presentation_failed' },
    { status: 409, headers: { 'Cache-Control': 'no-store' } }); }
}
