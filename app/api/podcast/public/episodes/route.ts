import { NextRequest } from 'next/server';
import { listPublicEpisodes } from '@/lib/podcast/public-episode';
import { podcastPublicJson, podcastPublicOptions } from '@/lib/podcast/public-cors';

export const runtime = 'nodejs';

export function OPTIONS(req: NextRequest) {
  return podcastPublicOptions(req);
}

export async function GET(req: NextRequest) {
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
  const safeLimit = Number.isFinite(limit) ? limit : 20;

  try {
    const episodes = await listPublicEpisodes(safeLimit);
    return podcastPublicJson(req, { ok: true, episodes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Kunne ikke hente episoder';
    return podcastPublicJson(req, { ok: false, error: msg, episodes: [] }, { status: 500 });
  }
}
