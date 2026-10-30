import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { readPodcastOperations, acknowledgePodcastIssue, persistPodcastOperations } from '@/lib/podcast/operations';
import { refreshPodcastFeed } from '@/lib/podcast/feed-refresh';
import { readPodcastManifest, writeFeedMirror } from '@/lib/podcast/manifest';
import { fetchPublishedPodcastArticles, syncPodcastFeedMetadata } from '@/lib/podcast/feed-metadata';
import { syncPodcastDurations, verifySpotifyDelivery } from '@/lib/podcast/delivery-facts';
import { podcastEpisodeGuid, selectPodcastRssEpisodes } from '@/lib/podcast/rss-episodes';
import { podcastAudioKey } from '@/lib/podcast/delivery-format';
export const runtime = 'nodejs';
export const maxDuration = 300;
const headers = { 'Cache-Control': 'private, no-store' };
async function access(req: NextRequest) {
  const actor = await editorialRequestAccess(req);
  return !actor ? NextResponse.json({ error: 'Log ind som ejer.' }, { status: 401, headers }) : !actor.owner
    ? NextResponse.json({ error: 'Kun ejeren har adgang.' }, { status: 403, headers }) : null;
}
export async function GET(req: NextRequest) {
  const denied = await access(req); if (denied) return denied;
  try { return NextResponse.json(await readPodcastOperations(), { headers }); }
  catch { return NextResponse.json({ error: 'Status kunne ikke hentes. Prøv igen.' }, { status: 503, headers }); }
}
export async function POST(req: NextRequest) {
  const denied = await access(req); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ugyldig handling.' }, { status: 400, headers }); }
  try {
    if (body.action === 'refresh') return refreshPodcastFeed();
    if (body.action === 'acknowledge' && typeof body.id === 'string' && typeof body.fingerprint === 'string') {
      const ok = await acknowledgePodcastIssue(body.id, body.fingerprint);
      return NextResponse.json({ ok }, { status: ok ? 200 : 409, headers });
    }
    if (!['repair_metadata', 'repair_duration', 'verify_spotify'].includes(String(body.action)) || typeof body.guid !== 'string' || typeof body.audioKey !== 'string')
      return NextResponse.json({ error: 'Ugyldig handling.' }, { status: 400, headers });
    const manifest = await readPodcastManifest(), selected = selectPodcastRssEpisodes(manifest.episodes), ep = selected.find(e => podcastEpisodeGuid(e) === body.guid);
    if (!ep || podcastAudioKey(ep) !== body.audioKey) return NextResponse.json({ error: 'Episoden er ændret. Opdater status før genoptagelse.' }, { status: 409, headers });
    const one = { ...manifest, episodes: [ep] };
    if (body.action === 'verify_spotify') {
      const result = await verifySpotifyDelivery(manifest, typeof body.spotifyUrl === 'string' ? body.spotifyUrl : undefined, body.guid);
      return NextResponse.json(result, { status: result.verified ? 200 : 422, headers });
    }
    const articles = await fetchPublishedPodcastArticles();
    const result = body.action === 'repair_metadata' ? await syncPodcastFeedMetadata(one, 1, { articles }) : await syncPodcastDurations(one, 1);
    if ('busy' in result && result.busy) return NextResponse.json(result, { status: 409, headers });
    await writeFeedMirror(await readPodcastManifest());
    const problems = result.failed.map(f => ({ scope: f.guid, stage: body.action === 'repair_metadata' ? 'metadata' : 'duration', reason: f.reason }));
    await persistPodcastOperations(manifest, articles, problems, ['metadata', 'duration']);
    return NextResponse.json({ ...result, audioRegenerated: false }, { status: result.failed.length ? 207 : 200, headers });
  } catch (error) {
    if (error instanceof Error && error.message === 'podcast_spotify_url_invalid') return NextResponse.json({ error: 'Indsæt et Spotify-episodelink.' }, { status: 400, headers });
    return NextResponse.json({ error: 'Handlingen blev ikke fuldført. Opdater status før du prøver igen.' }, { status: 503, headers });
  }
}
