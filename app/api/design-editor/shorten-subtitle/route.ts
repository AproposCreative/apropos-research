import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';

const headers = { 'Cache-Control': 'no-store' };

/** Retired paid endpoint. Fail closed for older tabs, not only the current UI. */
export async function POST(req: NextRequest) {
  if (!await getNewsletterUserIdFromRequest(req)) return NextResponse.json({ error: 'Log ind for at redigere underteksten.' }, { status: 401, headers });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ugyldig forespørgsel.' }, { status: 400, headers }); }
  if (!body || typeof body.subtitle !== 'string' || !body.subtitle.trim() || body.subtitle.length > 5000 || typeof body.title !== 'string' || body.title.length > 1000 || !['square', 'story'].includes(body.size)) {
    return NextResponse.json({ error: 'Ugyldig undertekst eller format.' }, { status: 400, headers });
  }
  return NextResponse.json({
    code: 'subtitle_chatgpt_first', paidAiCalls: 0,
    error: 'Genindlæs SoMe-editoren. Den tilpasser nu underteksten automatisk uden betalte AI-kald. Din artikeltekst er bevaret.',
  }, { status: 410, headers });
}
