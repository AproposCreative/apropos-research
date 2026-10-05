import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { readDeliveryState } from '@/lib/liv/delivery-store';
import { type DeliveryState, copenhagenClock } from '@/lib/liv/delivery-policy';
import { workspaceRef } from '@/lib/mcp/workspace';
import { hasArticleText, savedWritingSummary, SAVED_WRITING_NOTE } from './saved-writing-status';

export const workCatalogInput = z.object({ limit: z.number().int().min(1).max(50).default(10),
  query: z.string().max(150).optional() }).strict();
const text = (value: unknown, max = 300) => typeof value === 'string' ? value.slice(0, max) : null;
const code = (value: unknown) => typeof value === 'string' && /^[a-z0-9_]{1,160}$/.test(value) ? value : null;
export function workTimestamp(value: unknown): string | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') value = value.toDate();
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Stored publication evidence only. Ready is a manifest state, not fresh CMS verification. */
export function runSummary(id: string, row: Record<string, any>, state: DeliveryState, today: string) {
  const entry = row.webflowItemId ? state.entries.find(e => e.itemId === row.webflowItemId) : undefined;
  const publication = row.webflowItemId && Object.entries(state.slots).find(([, s]) => s.itemId === row.webflowItemId &&
    s.state === 'published' && s.publicUrl && s.checkedAt);
  const ready = entry?.state === 'ready' && !entry.publicationBlockers?.length && entry.decision !== 'rejected' && entry.expiresDay >= today;
  const hasText = hasArticleText(row.articleCheckpoint?.content);
  const stage = publication ? 'publication_receipt' : ready ? 'ready_manifest' : hasText ? 'written_draft' :
    row.articleCheckpoint ? 'checkpoint_incomplete' : 'plan_or_research';
  return { id, kind: 'liv-run', title: text(row.articleCheckpoint?.title) || text(row.title) || text(row.topic) || 'Emne ikke valgt',
    articleType: text(row.articleCheckpoint?.editorialKind || row.articleCheckpoint?.articleFormat, 80),
    createdAt: workTimestamp(row.createdAt), updatedAt: workTimestamp(row.updatedAt), scheduledDay: entry?.scheduledDay || text(row.dayKey, 10),
    stage, runStatus: code(row.status), blockers: [...(!publication && !ready && code(row.reason) ? [code(row.reason)!] : []), ...(entry?.publicationBlockers || [])],
    itemId: text(row.webflowItemId, 24), hasText,
    publication: publication ? { day: publication[0], publicUrl: publication[1].publicUrl, checkedAt: publication[1].checkedAt } : null,
    requiresFreshReadback: !!entry, publicationApproval: false,
    nextTool: 'get_liv_work', nextArguments: { runId: id } };
}

/** Shared bounded reads; never calls a model or loads a colleague's workspace. */
export async function readEditorialWorkSnapshot(uid: string) {
  const db = getAdminDb(); if (!db) throw Error('mcp_unavailable');
  const desk = createHash('sha256').update('liv-daily').digest('hex');
  const [runs, writing, workspace, state] = await Promise.all([
    db.collection('livDailyArticles').orderBy('updatedAt', 'desc').limit(100).get(),
    db.collection('livSourceArchives').doc(desk).collection('runs').orderBy('createdAt', 'desc').limit(100).get(),
    workspaceRef(uid).get(), readDeliveryState(),
  ]);
  return { runs, writing, workspace, state };
}

export async function listEditorialWork(uid: string, value: unknown) {
  const input = workCatalogInput.parse(value);
  const { runs, writing, workspace, state } = await readEditorialWorkSnapshot(uid);
  const today = copenhagenClock().day;
  const items: Record<string, any>[] = runs.docs.filter(d => /^(?:prepare|prepare-alternative|reserve|reserve-editorial)-20\d{2}-\d{2}-\d{2}$/.test(d.id))
    .map(d => runSummary(d.id, d.data(), state, today));
  for (const doc of writing.docs) {
    const row = doc.data();
    // Metadata projection only; raw provider output belongs to get_saved_writing.
    items.push({ id: doc.id, kind: 'saved-writing', ...savedWritingSummary(row),
      articleType: text(row.articleFormat, 80), createdAt: workTimestamp(row.createdAt), updatedAt: workTimestamp(row.recordedAt || row.createdAt),
      runStatus: code(row.status),
      nextTool: 'get_saved_writing', nextArguments: { writingRunId: doc.id } });
  }
  const current = workspace.data();
  if (current?.data?.currentDraftId) items.push({ id: current.data.currentDraftId, kind: 'private-workspace',
    title: text(current.data.articleData?.title) || text(current.data.chatTitle), stage: 'private_draft',
    updatedAt: workTimestamp(current.updatedAt), revision: current.revision, publicationApproval: false,
    nextTool: 'get_workspace', nextArguments: {} });
  const query = input.query?.toLocaleLowerCase('da').trim();
  const matching = items.filter(i => !query || `${i.title} ${i.id}`.toLocaleLowerCase('da').includes(query))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || String(a.id).localeCompare(String(b.id)));
  return { items: matching.slice(0, input.limit), matchingInWindow: matching.length,
    coverage: { runRows: runs.size, writingRows: writing.size, perSourceLimit: 100, truncated: runs.size === 100 || writing.size === 100,
      note: 'Seneste daterede arkivrækker, ikke hele CMS. Historiske rækker uden sorteringsdato kan mangle. Skriveforsøg og Liv-forløb er separate poster; ikke en optælling af unikke artikler.' },
    cmsDiscoveryTool: 'list_articles', savedWritingNote: SAVED_WRITING_NOTE,
    checkedAt: new Date().toISOString(), untrustedContent: true, paidAiCalls: 0 };
}
