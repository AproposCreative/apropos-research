import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { listRecentEpisodes } from '@/lib/podcast/manifest';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? Math.min(20, Math.max(1, Number.parseInt(limitRaw, 10) || 5)) : 5;

  try {
    const episodes = await listRecentEpisodes(limit);
    return NextResponse.json({ ok: true, episodes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Kunne ikke hente manifest';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
