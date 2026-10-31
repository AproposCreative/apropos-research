import { NextRequest, NextResponse } from 'next/server';
import { readPodcastManifest } from '@/lib/podcast/manifest';
import { podcastCorsHeaders, podcastPublicOptions } from '@/lib/podcast/public-cors';
import { buildPodcastRssXml } from '@/lib/podcast/rss';
import { podcastRssFeedUrl, podcastShowCoverUrl } from '@/lib/podcast/show-config';
import { readPodcastFeedMetadata } from '@/lib/podcast/feed-metadata';
import { readPodcastDeliveryFacts } from '@/lib/podcast/delivery-facts';

export const runtime = 'nodejs';

export function OPTIONS(req: NextRequest) {
  return podcastPublicOptions(req);
}

export async function GET(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin;
    const manifest = await readPodcastManifest();
    let metadataAvailable = true;
    const [metadata, facts] = await Promise.all([
      // A temporary metadata outage must not replace known covers with fallbacks
      // or return an apparently valid empty feed. Podcast clients can retry 503.
      readPodcastFeedMetadata(manifest),
      readPodcastDeliveryFacts(manifest).catch(() => { metadataAvailable = false; return {}; }),
    ]);
    const xml = buildPodcastRssXml({
      manifest,
      metadata,
      facts,
      feedUrl: podcastRssFeedUrl(origin),
      showCoverUrl: podcastShowCoverUrl(origin),
    });

    return new NextResponse(xml, {
      status: 200,
      headers: {
        ...podcastCorsHeaders(req),
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': metadataAvailable ? 'public, s-maxage=300, stale-while-revalidate=600' : 'no-store',
        'X-Podcast-Metadata': metadataAvailable ? 'synced' : 'temporarily-unavailable',
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Kunne ikke bygge RSS-feed' },
      {
        status: 503,
        headers: { ...podcastCorsHeaders(req), 'Cache-Control': 'no-store', 'Retry-After': '60' },
      }
    );
  }
}
