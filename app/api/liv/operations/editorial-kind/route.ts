import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { editorialKindOperationInput, setLivEditorialKind } from '@/lib/liv/editorial-kind-operation';

export const runtime = 'nodejs';
export const maxDuration = 30;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: NextRequest) {
  const denied = requireCronBearer(req);
  if (denied) return denied;
  let input: unknown;
  try {
    if (req.nextUrl.search) throw new Error('invalid');
    const raw = await req.text();
    if (raw.length > 2000) throw new Error('invalid');
    input = editorialKindOperationInput.parse(JSON.parse(raw));
  } catch { return json({ error: 'liv_editorial_kind_invalid' }, 400); }
  try { return json(await setLivEditorialKind(input)); }
  catch (error) {
    const code = error instanceof Error && /^liv_editorial_kind_(invalid|conflict|unavailable)$/.test(error.message)
      ? error.message : 'liv_editorial_kind_failed';
    return json({ error: code }, code.endsWith('invalid') ? 400 : code.endsWith('conflict') ? 409 : 503);
  }
}
