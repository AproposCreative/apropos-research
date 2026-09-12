import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { sourceUrl, type RetrievedSource } from '@/lib/factcheck/source-reader';
import { canonicalSourceUrl } from '@/lib/editorial/audience-signals';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const topicId = (topic: string) => hash(topic.toLocaleLowerCase('da').replace(/[^\p{L}\p{N}]+/gu, ' ').trim());
const validRunId = (value: unknown): value is string => typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const boundedText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && !!value.trim() && value.length <= max;
const validLabel = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(value);
const validDate = (value: unknown): value is string => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const finishReasons = ['stop', 'length', 'tool_calls', 'content_filter', 'function_call'] as const;
type FinishReason = typeof finishReasons[number] | null;
const validFinishReason = (value: unknown): value is FinishReason => value === null ||
  typeof value === 'string' && finishReasons.some(reason => reason === value);
export type WritingBriefSource = Pick<RetrievedSource, 'id' | 'url' | 'contentHash' | 'retrievedAt' | 'publishedAt'>;
export type RecoverableWritingBrief = {
  runId: string; rawResponse: string; writerText: string; sources: WritingBriefSource[];
  model: string; voiceVersion: string; parentRunId?: string; finishReason?: FinishReason; refusal?: string | null;
};

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
    tx.set(desk.collection('topics').doc(topicId(topic)), { sourceIds: records.map(row => row.id) }, { merge: true });
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
  sources?: WritingBriefSource[]; parentRunId?: string; finishReason?: FinishReason; refusal?: string | null;
}): Promise<void> {
  if (!scope || !validRunId(input.runId) || !input.writerText.trim() || input.writerText.length > 24000 ||
      (input.parentRunId !== undefined && (!validRunId(input.parentRunId) || input.parentRunId === input.runId)) ||
      (input.finishReason !== undefined && !validFinishReason(input.finishReason)) ||
      (input.refusal !== undefined && input.refusal !== null && (typeof input.refusal !== 'string' || input.refusal.length > 60000)) ||
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
    if (input.parentRunId !== undefined) {
      if (previous && previous.parentRunId !== input.parentRunId) throw new Error('research_recovery_conflict');
      if (!previous) {
        const parent = (await tx.get(desk.collection('runs').doc(input.parentRunId))).data();
        const pointer = (await tx.get(ref)).data();
        if (pointer?.latestBrief?.runId !== input.parentRunId || !boundedText(parent?.rawResponse, 60000)) {
          throw new Error('research_recovery_conflict');
        }
      }
    }
    // Diagnostics may be appended, but a paid response and its provenance cannot
    // be replaced. An originality rewrite belongs to a new, linked run.
    if (previous?.rawResponse !== undefined) {
      for (const key of ['rawResponse', 'writerText', 'model', 'voiceVersion', 'sources', 'tokenUsage', 'finishReason', 'refusal', 'parentRunId'] as const) {
        if (input[key] !== undefined && JSON.stringify(input[key]) !== JSON.stringify(previous[key])) {
          throw new Error('research_recovery_conflict');
        }
      }
    }
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

/** Recover private paid output, not an approved article. The caller must parse
 * its schema and re-fetch these source URLs through the guarded source reader.
 * Legacy runs have no finish evidence; absence must never be turned into "stop".
 */
export async function loadRecoverableWritingBrief(scope: string, topic: string, runId: string): Promise<RecoverableWritingBrief> {
  if (!boundedText(scope, 512) || !boundedText(topic, 1000) || !validRunId(runId)) throw new Error('research_recovery_invalid');
  const db = getAdminDb();
  if (!db) throw new Error('source_archive_unavailable');
  const desk = db.collection('livSourceArchives').doc(hash(scope));
  return db.runTransaction(async tx => {
    const pointer = (await tx.get(desk.collection('topics').doc(topicId(topic)))).data();
    if (asRecord(pointer?.latestBrief)?.runId !== runId) throw new Error('research_recovery_conflict');
    const row = (await tx.get(desk.collection('runs').doc(runId))).data();
    if (!row) throw new Error('research_recovery_missing');
    if (row.runId !== runId) throw new Error('research_recovery_conflict');
    if (!boundedText(row.rawResponse, 60000) || !boundedText(row.writerText, 24000) ||
        !validLabel(row.model) || !validLabel(row.voiceVersion) ||
        (row.parentRunId !== undefined && (!validRunId(row.parentRunId) || row.parentRunId === runId)) ||
        !Array.isArray(row.sources) || !row.sources.length || row.sources.length > 8 ||
        (row.finishReason !== undefined && !validFinishReason(row.finishReason)) ||
        (row.refusal !== undefined && row.refusal !== null && (typeof row.refusal !== 'string' || row.refusal.length > 60000))) {
      throw new Error('research_recovery_invalid');
    }
    const ids = new Set<string>();
    const urls = new Set<string>();
    const sources = row.sources.map((value: unknown): WritingBriefSource => {
      const source = asRecord(value);
      if (!source || typeof source.id !== 'string' || !/^S[1-8]$/.test(source.id) ||
          !boundedText(source.url, 4096) || typeof source.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(source.contentHash) ||
          !validDate(source.retrievedAt) || !(source.publishedAt === null || validDate(source.publishedAt))) {
        throw new Error('research_recovery_invalid');
      }
      let url: URL;
      try { url = sourceUrl(source.url); } catch { throw new Error('research_recovery_invalid'); }
      if ([...url.searchParams.keys()].some(key => /token|secret|password|signature|credential|api.?key/i.test(key)) ||
          ids.has(source.id) || urls.has(url.href)) throw new Error('research_recovery_invalid');
      ids.add(source.id); urls.add(url.href);
      return { id: source.id, url: source.url, contentHash: source.contentHash,
        retrievedAt: source.retrievedAt, publishedAt: typeof source.publishedAt === 'string' ? source.publishedAt : null };
    });
    return { runId, rawResponse: row.rawResponse, writerText: row.writerText, sources, model: row.model, voiceVersion: row.voiceVersion,
      ...(row.parentRunId !== undefined ? { parentRunId: row.parentRunId } : {}),
      ...(row.finishReason !== undefined ? { finishReason: row.finishReason } : {}),
      ...(row.refusal !== undefined ? { refusal: row.refusal } : {}) };
  });
}
