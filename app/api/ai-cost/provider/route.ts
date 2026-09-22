import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { readProviderHold, resumeProvider } from '@/lib/ai/provider-hold';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  if (!(await editorialRequestAccess(request))?.owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  try { return NextResponse.json(await readProviderHold(), { headers }); }
  catch { return NextResponse.json({ error: 'Status kunne ikke hentes.' }, { status: 503, headers }); }
}
export async function POST(request: NextRequest) {
  const access = await editorialRequestAccess(request);
  if (!access?.owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  let value;
  try { value = await request.json(); } catch { return NextResponse.json({ error: 'Ugyldigt input.' }, { status: 400, headers }); }
  if (value?.action !== 'resume-after-billing-change' || !Number.isSafeInteger(value.revision) || value.revision < 1) {
    return NextResponse.json({ error: 'Ugyldigt input.' }, { status: 400, headers });
  }
  try { return NextResponse.json(await resumeProvider(value.revision, access.uid), { headers }); }
  catch (error) { return NextResponse.json({ error: 'Status er ændret. Opdatér og prøv igen.' },
    { status: error instanceof Error && error.message === 'provider_hold_conflict' ? 409 : 503, headers }); }
}
