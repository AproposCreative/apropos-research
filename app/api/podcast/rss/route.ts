import { NextRequest, NextResponse } from 'next/server';
import { readPodcastManifest } from '@/lib/podcast/manifest';
import { podcastCorsHeaders, podcastPublicOptions } from '@/lib/podcast/public-cors';
import { buildPodcastRssXml } from '@/lib/podcast/rss';
import { podcastRssFeedUrl, podcastShowCoverUrl } from '@/lib/podcast/show-config';

export const runtime = 'nodejs';

export function OPTIONS(req: NextRequest) {
  return podcastPublicOptions(req);
}

export async function GET(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin;
    const manifest = await readPodcastManifest();
    const xml = buildPodcastRssXml({
      manifest,
      feedUrl: podcastRssFeedUrl(origin),
      showCoverUrl: podcastShowCoverUrl(origin),
    });

    return new NextResponse(xml, {
      status: 200,
      headers: {
        ...podcastCorsHeaders(req),
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Kunne ikke bygge RSS-feed';
    return NextResponse.json(
      { ok: false, error: msg },
      {
        status: 500,
        headers: podcastCorsHeaders(req),
      }
    );
  }
}
