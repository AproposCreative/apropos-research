import { NextResponse } from 'next/server';
import { readPodcastManifest, writeFeedMirror } from './manifest';
import { syncPodcastFeedMetadata, fetchPublishedPodcastArticles } from './feed-metadata';
import { syncPodcastDurations, verifySpotifyDelivery } from './delivery-facts';
import { persistPodcastOperations, readPodcastIssues, reconcilePodcastIssues } from './operations';
import { getAdminDb } from '@/lib/firebase-admin';
import { randomUUID } from 'node:crypto';

/** Shared by owner action and authenticated cron. No SMTP, AI or audio generation. */
export async function refreshPodcastFeed() {
  const headers = { 'Cache-Control': 'private, no-store' };
  const db = getAdminDb(); if (!db) return NextResponse.json({ error: 'Statuslageret er ikke tilgængeligt.' }, { status: 503, headers });
  const lock = db.collection('podcastFeedOperations').doc('delivery-refresh'), lease = randomUUID();
  const acquired = await db.runTransaction(async tx => {
    const old = (await tx.get(lock)).data(); if (Number(old?.until) > Date.now()) return false;
    tx.set(lock, { lease, until: Date.now() + 270_000 }); return true;
  });
  if (!acquired) return NextResponse.json({ busy: true }, { status: 409, headers });
  let failureStage = 'metadata_sync_failed';
  try {
    const manifest = await readPodcastManifest(), articles = await fetchPublishedPodcastArticles(), oldIssues = await readPodcastIssues();
    const result = await syncPodcastFeedMetadata(manifest, 20, { articles, deferGuids: oldIssues.filter(i => i.stage === 'metadata').map(i => i.scope) });
    if (result.busy) return NextResponse.json(result, { status: 409, headers });
    failureStage = 'duration_sync_failed';
    const durations = await syncPodcastDurations(manifest);
    const spotify = await verifySpotifyDelivery(manifest).catch(() => ({ verified: false, reason: 'spotify_unavailable' }));
    const problems = [...result.failed.map(f => ({ scope: f.guid, stage: 'metadata', reason: f.reason })),
      ...durations.failed.map(f => ({ scope: f.guid, stage: 'duration', reason: f.reason }))];
    try { await writeFeedMirror(await readPodcastManifest()); }
    catch { problems.push({ scope: 'feed', stage: 'mirror', reason: 'feed_mirror_failed' }); }
    failureStage = 'status_sync_failed';
    const report = await persistPodcastOperations(manifest, articles, problems, ['audio', 'metadata', 'duration', 'sync', 'mirror']);
    return NextResponse.json({ ...result, durationUpdated: durations.updated, durationRemaining: durations.remaining,
      durationFailed: durations.failed, spotify, newIssues: report.summary.newIssues }, { status: problems.length ? 207 : 200, headers });
  } catch {
    await reconcilePodcastIssues([{ scope: 'feed', stage: 'sync', reason: failureStage }], []).catch(() => {});
    return NextResponse.json({ error: 'Podcastmetadata kunne ikke opdateres. Eksisterende lyd og metadata er bevaret.' }, { status: 503, headers });
  } finally {
    await db.runTransaction(async tx => { if ((await tx.get(lock)).data()?.lease === lease) tx.delete(lock); }).catch(() => {});
  }
}
