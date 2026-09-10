import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { sourceUrl, type RetrievedSource } from '@/lib/factcheck/source-reader';
import { canonicalSourceUrl } from '@/lib/editorial/audience-signals';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const topicId = (topic: string) => hash(topic.toLocaleLowerCase('da').replace(/[^\p{L}\p{N}]+/gu, ' ').trim());

export function archiveSourceRecord(source: RetrievedSource) {
  const url = sourceUrl(source.url);
  if ([...url.searchParams.keys()].some(key => /token|secret|password|signature|credential|api.?key/i.test(key))) {
    throw new Error('source_url_contains_credentials');
  }
  const canonicalUrl = canonicalSourceUrl(url.href)!;
  // Strip marketing identifiers from stored retrieval URLs, retaining the actual www host.
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  return { id: hash(canonicalUrl), canonicalUrl, url: url.href, host: url.hostname.replace(/^www\./, ''),
    title: source.title.slice(0, 250), snippet: source.text.slice(0, 300),
    contentHash: source.contentHash, retrievedAt: source.retrievedAt, publishedAt: source.publishedAt,
    verificationStatus: 'retrieved_not_verified' as const };
}

/** Per-desk metadata archive, not a full-text copy or a fact-verification database. */
export async function rememberResearchSources(scope: string, topic: string, sources: RetrievedSource[]): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error('source_archive_unavailable');
  const desk = db.collection('livSourceArchives').doc(hash(scope));
  const records = sources.slice(0, 8).map(archiveSourceRecord);
  await db.runTransaction(async tx => {
    const refs = records.map(row => desk.collection('sources').doc(row.id));
    const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
    records.forEach((row, i) => {
      tx.set(refs[i], { ...row, firstSeenAt: snapshots[i].data()?.firstSeenAt || row.retrievedAt,
        lastSeenAt: row.retrievedAt }, { merge: true });
      // Host discovery is recorded but never auto-enables a crawler or claims trust.
      tx.set(desk.collection('media').doc(hash(row.host)), { host: row.host, status: 'discovered', lastSeenAt: row.retrievedAt }, { merge: true });
    });
    tx.set(desk.collection('topics').doc(topicId(topic)), { sourceIds: records.map(row => row.id) });
  });
}

/** Return leads only. Every recalled URL must be fetched and checked again. */
export async function recalledSourceUrls(scope: string, topic: string): Promise<string[]> {
  const db = getAdminDb();
  if (!db) throw new Error('source_archive_unavailable');
  const desk = db.collection('livSourceArchives').doc(hash(scope));
  const record = (await desk.collection('topics').doc(topicId(topic)).get()).data();
  const ids = Array.isArray(record?.sourceIds) ? record.sourceIds.filter((id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)).slice(0, 8) : [];
  const rows = await Promise.all(ids.map(id => desk.collection('sources').doc(id).get()));
  return rows.flatMap(row => {
    try { return [sourceUrl(row.data()?.url).href]; } catch { return []; }
  });
}

/** Private run history plus latest-topic pointer, never a publication approval. */
export async function rememberWritingBrief(scope: string, topic: string, input: {
  runId: string; writerText: string; model: string; voiceVersion: string; missingEvidence?: string[];
  rawResponse?: string; tokenUsage?: { input: number; output: number };
  sources?: Array<Pick<RetrievedSource, 'id' | 'url' | 'contentHash' | 'retrievedAt' | 'publishedAt'>>;
}): Promise<void> {
  if (!scope || !/^[a-f0-9-]{36}$/.test(input.runId) || !input.writerText.trim() || input.writerText.length > 24000 ||
      (input.rawResponse?.length || 0) > 60000 ||
      (input.sources?.length || 0) > 8 ||
      (input.missingEvidence?.length || 0) > 6 || input.missingEvidence?.some(s => s.length > 500)) {
    throw new Error('research_diagnostic_invalid');
  }
  const db = getAdminDb();
  if (!db) throw new Error('source_archive_unavailable');
  const desk = db.collection('livSourceArchives').doc(hash(scope));
  const ref = desk.collection('topics').doc(topicId(topic));
  const run = desk.collection('runs').doc(input.runId);
  await db.runTransaction(async tx => {
    const previous = (await tx.get(run)).data();
    const row = { ...input, missingEvidence: input.missingEvidence || [],
      status: input.missingEvidence?.length ? 'insufficient_evidence' : 'not_verified',
      textHash: hash(input.writerText), recordedAt: new Date().toISOString(),
      createdAt: previous?.createdAt || new Date().toISOString() };
    tx.set(run, row, { merge: true });
    tx.set(ref, { latestBrief: row }, { merge: true });
  });
}

export async function readWritingBrief(scope: string, runId: string) {
  if (!scope || !/^[a-f0-9-]{36}$/.test(runId)) return null;
  const db = getAdminDb();
  if (!db) throw new Error('source_archive_unavailable');
  return (await db.collection('livSourceArchives').doc(hash(scope)).collection('runs').doc(runId).get()).data() || null;
}
