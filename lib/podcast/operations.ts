import { getAdminDb } from '@/lib/firebase-admin';
import { readPodcastManifest } from './manifest';
import { fetchPublishedPodcastArticles, readPodcastFeedMetadata } from './feed-metadata';
import { readPodcastDeliveryFacts } from './delivery-facts';
import { nextPodcastIssue, podcastIssueId, type PodcastIssue } from './delivery-format';
import { buildPodcastOperations, collectPodcastProblems, type PodcastQueueStatus, type PodcastOperationsData } from './operations-format';
import type { PublishedPodcastArticle } from './feed-metadata-format';
import type { PodcastManifest } from './types';
import { podcastSourceHash } from './feed-metadata-format';
import { PODCAST_ARTWORK_STYLE } from './artwork-style';

function database() { const db = getAdminDb(); if (!db) throw Error('podcast_storage_unavailable'); return db; }
function iso(value: unknown): string | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().toISOString();
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
export async function readPodcastQueues(articles: PublishedPodcastArticle[]): Promise<PodcastQueueStatus[]> {
  const db = database();
  const references = articles.filter(article => !article.slug.includes('/')).map(article => db.collection('narration_queue').doc(article.slug));
  const snapshots = await Promise.all([
    references.length ? db.getAll(...references) : Promise.resolve([]),
    db.collection('podcastJobs').orderBy('updatedAt', 'desc').limit(200).select('slug', 'status', 'createdAt', 'updatedAt').get(),
  ]);
  const docs = [...snapshots[0], ...snapshots[1].docs];
  return docs.filter(doc => doc.exists).map(doc => {
    const v = doc.data()!; return { slug: String(v.slug || doc.id), status: String(v.status || 'unknown'), at: iso(v.updatedAt || v.processedAt || v.createdAt) };
  });
}
export async function readPodcastIssues(): Promise<PodcastIssue[]> {
  const snapshot = await database().collection('podcastDeliveryIssues').where('active', '==', true).limit(500).get();
  return snapshot.docs.map(doc => doc.data() as PodcastIssue);
}
/** One active incident per stage/episode; unchanged repeats never become new alerts. */
export async function reconcilePodcastIssues(problems: Array<{ scope: string; stage: string; reason: string }>, resolvedStages: string[]) {
  const db = database(), stateRef = db.collection('podcastFeedOperations').doc('delivery-status');
  const state = await stateRef.get(), baseline = !state.exists, now = new Date().toISOString();
  const active = await readPodcastIssues(), present = new Set(problems.map(p => podcastIssueId(p.scope, p.stage)));
  for (const problem of problems) {
    const ref = db.collection('podcastDeliveryIssues').doc(podcastIssueId(problem.scope, problem.stage));
    await db.runTransaction(async tx => {
      const previous = (await tx.get(ref)).data() as PodcastIssue | undefined;
      const next = nextPodcastIssue(previous, problem, now, baseline);
      if (!previous?.active || previous.fingerprint !== next.fingerprint || previous.acknowledgedFingerprint !== next.acknowledgedFingerprint) tx.set(ref, next);
    });
  }
  for (const old of active) if (resolvedStages.includes(old.stage) && !present.has(old.id))
    await db.collection('podcastDeliveryIssues').doc(old.id).set({ active: false, resolvedAt: now }, { merge: true });
}
export async function acknowledgePodcastIssue(id: string, fingerprint: string) {
  if (!/^[a-f0-9]{64}$/.test(id) || !/^[a-f0-9]{64}$/.test(fingerprint)) throw Error('podcast_issue_invalid');
  const db = database(), ref = db.collection('podcastDeliveryIssues').doc(id);
  return db.runTransaction(async tx => {
    const issue = (await tx.get(ref)).data() as PodcastIssue | undefined;
    if (!issue || issue.fingerprint !== fingerprint) return false;
    tx.set(ref, { acknowledgedFingerprint: fingerprint, acknowledgedAt: new Date().toISOString() }, { merge: true }); return true;
  });
}
export async function buildLivePodcastOperations(manifest?: PodcastManifest, articles?: PublishedPodcastArticle[]): Promise<PodcastOperationsData> {
  const actualManifest = manifest || await readPodcastManifest();
  const actualArticles = articles || await fetchPublishedPodcastArticles();
  const [metadata, facts, queues, issues, state] = await Promise.all([
    readPodcastFeedMetadata(actualManifest), readPodcastDeliveryFacts(actualManifest),
    readPodcastQueues(actualArticles), readPodcastIssues(), database().collection('podcastFeedOperations').doc('delivery-status').get(),
  ]);
  const data = state.data();
  return buildPodcastOperations({ manifest: actualManifest, articles: actualArticles, metadata, facts, queues, issues,
    now: new Date().toISOString(), lastSync: data?.lastSync || null });
}
export async function readPodcastOperations(): Promise<PodcastOperationsData> {
  try { return await buildLivePodcastOperations(); }
  catch {
    const cached = (await database().collection('podcastFeedOperations').doc('delivery-status').get()).data()?.report as PodcastOperationsData | undefined;
    if (!cached) throw Error('podcast_status_unavailable');
    return { ...cached, stale: true };
  }
}
export async function persistPodcastOperations(manifest: PodcastManifest, articles: PublishedPodcastArticle[], stageProblems: Array<{ scope: string; stage: string; reason: string }>, resolvedStages: string[]) {
  const [metadata, queues, facts, oldIssues] = await Promise.all([readPodcastFeedMetadata(manifest), readPodcastQueues(articles), readPodcastDeliveryFacts(manifest), readPodcastIssues()]);
  const problems = [...collectPodcastProblems({ manifest, articles, metadata, queues, facts, now: Date.now() }), ...stageProblems];
  // A bounded batch must not resolve another episode's unattempted failure.
  for (const old of oldIssues) if (old.stage === 'metadata' && old.reason !== 'source_missing' && !stageProblems.some(p => p.scope === old.scope && p.stage === old.stage)) {
    const cached = metadata[old.scope], article = cached && articles.find(a => a.id === cached.id);
    if (!cached || !article || cached.sourceHash !== podcastSourceHash(article) || cached.artworkStyle !== PODCAST_ARTWORK_STYLE)
      problems.push({ scope: old.scope, stage: old.stage, reason: old.reason });
  }
  await reconcilePodcastIssues(problems, resolvedStages);
  const lastSync = { at: new Date().toISOString(), status: problems.some(p => p.reason !== 'source_missing') ? 'issues' : 'ok' };
  const report = await buildLivePodcastOperations(manifest, articles); report.lastSync = lastSync;
  await database().collection('podcastFeedOperations').doc('delivery-status').set({ lastSync, report }, { merge: true });
  return report;
}
