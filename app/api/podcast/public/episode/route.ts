import { NextRequest } from 'next/server';
import { findPublicEpisodeBySlug } from '@/lib/podcast/public-episode';
import { podcastPublicJson, podcastPublicOptions } from '@/lib/podcast/public-cors';

export const runtime = 'nodejs';

export function OPTIONS(req: NextRequest) {
  return podcastPublicOptions(req);
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')?.trim() || '';
  if (!slug) {
    return podcastPublicJson(req, { ok: false, found: false, error: 'Mangler slug' }, { status: 400 });
  }

  try {
    const episode = await findPublicEpisodeBySlug(slug);
    if (!episode) {
      return podcastPublicJson(req, { ok: true, found: false, episode: null });
    }
    return podcastPublicJson(req, { ok: true, found: true, episode });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Kunne ikke hente episode';
    return podcastPublicJson(req, { ok: false, found: false, error: msg }, { status: 500 });
  }
}
