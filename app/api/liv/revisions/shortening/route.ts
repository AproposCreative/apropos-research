import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { readLivShorteningBaseline } from '@/lib/liv/shortening-baseline';
import { requestLivShortening } from '@/lib/liv/request-shortening';
import { shorteningProposalInput } from '@/lib/liv/shortening-proposal';
import { getLivCostPretransportError } from '@/lib/liv/cost-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status,
  headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(req: NextRequest) {
  const access = await editorialRequestAccess(req);
  if (!access) return reply({ error: 'liv_revision_login_required' }, 401);
  if (!access.owner) return reply({ error: 'liv_revision_owner_required' }, 403);
  const params = req.nextUrl.searchParams;
  if ([...params.keys()].some(key => key !== 'itemId') || params.getAll('itemId').length !== 1 ||
    !/^[a-f0-9]{24}$/.test(params.get('itemId') || '')) return reply({ error: 'liv_shortening_invalid' }, 400);
  try { return reply(await readLivShorteningBaseline(params.get('itemId')!)); }
  catch (error) {
    const code = error instanceof Error && /^liv_shortening_[a-z_]{1,60}$/.test(error.message)
      ? error.message : 'liv_shortening_failed';
    return reply({ error: code }, ['liv_shortening_failed', 'liv_shortening_configuration'].includes(code) ? 503 : 409);
  }
}

export async function POST(req: NextRequest) {
  const access = await editorialRequestAccess(req);
  if (!access) return reply({ error: 'liv_revision_login_required' }, 401);
  if (!access.owner) return reply({ error: 'liv_revision_owner_required' }, 403);
  let input;
  try {
    if (req.nextUrl.search) throw new Error('invalid');
    const raw = await req.text();
    if (raw.length > 2000) throw new Error('invalid');
    input = shorteningProposalInput.parse(JSON.parse(raw));
  } catch { return reply({ error: 'liv_shortening_invalid' }, 400); }
  try { return reply(await requestLivShortening(input)); }
  catch (error) {
    if (getLivCostPretransportError(error)) return reply({ error: 'liv_shortening_budget_denied',
      publicationReady: false, providerAttempted: false }, 429);
    const code = error instanceof Error && /^liv_shortening_[a-z_]{1,60}$/.test(error.message)
      ? error.message : 'liv_shortening_failed';
    return reply({ error: code, publicationReady: false },
      ['liv_shortening_failed', 'liv_shortening_configuration', 'liv_shortening_store_unavailable'].includes(code) ? 503 : 409);
  }
}
