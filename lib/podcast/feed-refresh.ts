import { NextResponse } from 'next/server';
import { readPodcastManifest, writeFeedMirror } from './manifest';
import { syncPodcastFeedMetadata } from './feed-metadata';

/** Shared by owner action and authenticated cron. No SMTP, AI or audio generation. */
export async function refreshPodcastFeed() {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const result = await syncPodcastFeedMetadata(await readPodcastManifest());
    if (!result.busy) await writeFeedMirror(await readPodcastManifest());
    return NextResponse.json(result, { status: result.busy ? 409 : 200, headers });
  } catch {
    return NextResponse.json({ error: 'Podcastmetadata kunne ikke opdateres. Eksisterende lyd og metadata er bevaret.' }, { status: 503, headers });
  }
}
