import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { coverRevisionInput, reviseLivCover, cancelLivCoverBeforePatch } from '@/lib/liv/cover-revision';

export const runtime = 'nodejs';
export const maxDuration = 300;
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status,
  headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(req: NextRequest) { return mutate(req, false); }
export async function DELETE(req: NextRequest) { return mutate(req, true); }
async function mutate(req: NextRequest, cancel: boolean) {
  const access = await editorialRequestAccess(req);
  if (!access) return reply({ error: 'liv_revision_login_required' }, 401);
  if (!access.owner) return reply({ error: 'liv_revision_owner_required' }, 403);
  let input;
  try {
    if (req.nextUrl.search) throw new Error('invalid');
    const raw = await req.text();
    if (raw.length > 8000) throw new Error('invalid');
    input = coverRevisionInput.parse(JSON.parse(raw));
  } catch { return reply({ error: 'liv_cover_invalid' }, 400); }
  try { return reply(await (cancel ? cancelLivCoverBeforePatch(input) : reviseLivCover(input))); }
  catch (error) {
    const code = error instanceof Error && /^liv_cover_[a-z_]{1,60}$/.test(error.message)
      ? error.message : 'liv_cover_failed';
    return reply({ error: code, publicationVerified: false }, code.startsWith('liv_cover_invalid') ? 400 :
      ['liv_cover_store_unavailable', 'liv_cover_configuration', 'liv_cover_failed'].includes(code) ? 503 : 409);
  }
}
