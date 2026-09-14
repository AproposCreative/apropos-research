import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { presentationRevisionInput, reviseLivPresentation, cancelUnstartedLivPresentation } from '@/lib/liv/presentation-revision';
import { readLivPresentationBaseline } from '@/lib/liv/presentation-baseline';

export const runtime = 'nodejs';
export const maxDuration = 300;
const reply = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store' },
});

export async function GET(req: NextRequest) {
  const access = await editorialRequestAccess(req);
  if (!access) return reply({ error: 'liv_revision_login_required' }, 401);
  if (!access.owner) return reply({ error: 'liv_revision_owner_required' }, 403);
  const params = req.nextUrl.searchParams;
  if ([...params.keys()].some(key => key !== 'itemId') || params.getAll('itemId').length !== 1 ||
    !/^[a-f0-9]{24}$/.test(params.get('itemId') || '')) return reply({ error: 'liv_presentation_invalid' }, 400);
  try { return reply(await readLivPresentationBaseline(params.get('itemId')!)); }
  catch (error) {
    const code = error instanceof Error && /^liv_presentation_[a-z_]+$/.test(error.message)
      ? error.message : 'liv_presentation_failed';
    return reply({ error: code }, ['liv_presentation_configuration', 'liv_presentation_failed'].includes(code) ? 503 : 409);
  }
}

// Interactive copyediting uses the same durable journal and CMS fencing as
// operations/presentation. Never expose a cron credential to the client.
export async function POST(req: NextRequest) {
  return mutate(req, false);
}

export async function DELETE(req: NextRequest) {
  return mutate(req, true);
}

async function mutate(req: NextRequest, cancel: boolean) {
  const access = await editorialRequestAccess(req);
  if (!access) return reply({ error: 'liv_revision_login_required' }, 401);
  if (!access.owner) return reply({ error: 'liv_revision_owner_required' }, 403);
  let input;
  try {
    if (req.nextUrl.search) throw new Error('invalid');
    const raw = await req.text();
    if (raw.length > 6000) throw new Error('invalid');
    input = presentationRevisionInput.omit({ restorePreparedIntro: true, restorePreparedCaptions: true })
      .strict().parse(JSON.parse(raw));
  } catch { return reply({ error: 'liv_presentation_invalid' }, 400); }
  try {
    return reply(await (cancel ? cancelUnstartedLivPresentation(input) : reviseLivPresentation(input)));
  } catch (error) {
    // Return only stable application codes, never upstream responses or tokens.
    const code = error instanceof Error && /^liv_presentation_[a-z_]+$/.test(error.message)
      ? error.message : 'liv_presentation_failed';
    return reply({ error: code, publicationVerified: false },
      code === 'liv_presentation_invalid' ? 400 :
        ['liv_presentation_store_unavailable', 'liv_presentation_configuration', 'liv_presentation_failed'].includes(code) ? 503 : 409);
  }
}
