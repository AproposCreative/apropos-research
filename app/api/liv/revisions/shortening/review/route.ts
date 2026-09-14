import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { recordLivShorteningReview, shorteningReviewInput } from '@/lib/liv/shortening-review';

export const runtime = 'nodejs';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status,
  headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(req: NextRequest) {
  const access = await editorialRequestAccess(req);
  if (!access) return reply({ error: 'liv_revision_login_required' }, 401);
  if (!access.owner) return reply({ error: 'liv_revision_owner_required' }, 403);
  let input;
  try {
    if (req.nextUrl.search) throw new Error('invalid');
    const raw = await req.text();
    if (raw.length > 2000) throw new Error('invalid');
    input = shorteningReviewInput.parse(JSON.parse(raw));
  } catch { return reply({ error: 'liv_shortening_review_invalid' }, 400); }
  try { return reply(await recordLivShorteningReview(input, access.uid)); }
  catch (error) {
    const code = error instanceof Error && /^liv_shortening_[a-z_]{1,60}$/.test(error.message)
      ? error.message : 'liv_shortening_failed';
    return reply({ error: code, publicationReady: false },
      ['liv_shortening_failed', 'liv_shortening_store_unavailable', 'liv_shortening_configuration'].includes(code) ? 503 : 409);
  }
}
