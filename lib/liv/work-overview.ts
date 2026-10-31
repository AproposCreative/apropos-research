import { assessLivTopic, type LivRemitAssessment } from './editorial-remit';
import { getAdminDb } from '@/lib/firebase-admin';
import { draftPresence } from '@/lib/editorial/draft-overview';
import { workTimestamp } from '@/lib/editorial/work-catalog';
import { livProductionIdentity } from '@/lib/editorial/liv-production-identity';
import { readEditorialCmsCandidates } from '@/lib/image-gen/webflow';
import { getSubmissionOptions } from '@/lib/editorial/submission-options';
import { readMapping } from '@/lib/webflow-mapping';

export type LivWorkItem = {
  id: string; title: string; source: 'chatgpt-submission' | 'saved-checkpoint' | 'editorial-desk' | 'cms-draft';
  cmsItemId: string | null;
  editorialRemit?: LivRemitAssessment;
  kind: 'scheduled' | 'reserve'; scheduledDay: string | null;
  revision: number | null; updatedAt: string | null;
  researchCount: number;
  status: 'draft' | 'blocked' | 'prepared' | 'processing';
  missing: string[]; previewUrl: string | null;
};

type SavedRow = { id: string; data: Record<string, any> };
const safeTitle = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 240) : 'Artikel uden titel';
const validId = (value: string) => /^[a-f0-9]{64}$/.test(value);
const count = (value: unknown) => Array.isArray(value) ? value.length : 0;

/** Only saved article text with explicit Liv provenance is a work item. Plans and model attempts are not articles. */
export function projectLivWork(submissions: SavedRow[], runs: SavedRow[], desk: SavedRow[] = [], recentSince = '', livAuthorIds: string[] = []): LivWorkItem[] {
  const items: LivWorkItem[] = [];
  const cmsIds = new Set<string>();
  for (const { id, data: row } of submissions) {
    const identity = livProductionIdentity.safeParse(row.livProduction);
    if (!validId(id) || (!identity.success && !livAuthorIds.includes(row.article?.author) && !/^(liv|liv brandt)$/iu.test(row.article?.author || '')) || row.status === 'published' ||
      draftPresence(row.article && typeof row.article === 'object' ? row.article : {}).hasText !== true) continue;
    const cmsId = row.prepared?.itemId;
    if (typeof cmsId === 'string' && /^[a-f0-9]{24}$/.test(cmsId)) cmsIds.add(cmsId);
    const status = row.status === 'blocked' ? 'blocked' : row.status === 'prepared' ? 'prepared' :
      row.status === 'processing' ? 'processing' : 'draft';
    items.push({ id, editorialRemit: assessLivTopic({ ...row.article, kind: row.choices?.kind }), title: safeTitle(row.article?.title), source: 'chatgpt-submission',
      cmsItemId: typeof cmsId === 'string' && /^[a-f0-9]{24}$/.test(cmsId) ? cmsId : null,
      kind: identity.success ? identity.data.kind : 'scheduled', scheduledDay: identity.success && identity.data.kind === 'scheduled' ? identity.data.day : null,
      revision: Number.isSafeInteger(row.revision) ? row.revision : null, updatedAt: workTimestamp(row.updatedAt),
      researchCount: count(row.research),
      status, missing: draftPresence(row.article).missing,
      previewUrl: `/connect/chatgpt?submission=${id}` });
  }
  for (const { id, data: row } of runs) {
    if (!/^(?:prepare|prepare-alternative|reserve|reserve-editorial)-20\d{2}-\d{2}-\d{2}$/.test(id) ||
      (recentSince && (!workTimestamp(row.updatedAt) || workTimestamp(row.updatedAt)! < recentSince)) ||
      draftPresence(row.articleCheckpoint && typeof row.articleCheckpoint === 'object' ? row.articleCheckpoint : {}).hasText !== true || row.status === 'published' ||
      (typeof row.webflowItemId === 'string' && cmsIds.has(row.webflowItemId))) continue;
    const article = row.articleCheckpoint;
    const presence = draftPresence(article);
    const day = /^.*-(20\d{2}-\d{2}-\d{2})$/.exec(id)?.[1] || null;
    items.push({ id, editorialRemit: assessLivTopic(article), title: safeTitle(article.title), source: 'saved-checkpoint',
      cmsItemId: typeof row.webflowItemId === 'string' && /^[a-f0-9]{24}$/.test(row.webflowItemId) ? row.webflowItemId : null,
      kind: id.startsWith('reserve') ? 'reserve' : 'scheduled', scheduledDay: id.startsWith('reserve') ? null : day,
      revision: null, updatedAt: workTimestamp(row.updatedAt), status: row.status === 'failed' ? 'blocked' : 'draft',
      researchCount: count(article.researchSources),
      missing: presence.missing, previewUrl: null });
  }
  for (const { id, data: row } of desk) {
    const article = row.article;
    if (!validId(id) || !article ||
      (recentSince && (!workTimestamp(row.updatedAt) || workTimestamp(row.updatedAt)! < recentSince)) ||
      draftPresence(article).hasText !== true) continue;
    const presence = draftPresence({ ...article, author: 'Liv Brandt', category: article.section,
      featuredImage: article.selectedImage?.url, fotoCredit: article.selectedImage?.credit });
    items.push({ id, editorialRemit: assessLivTopic(article), title: safeTitle(article.title), source: 'editorial-desk', cmsItemId: null,
      kind: 'scheduled', scheduledDay: null, revision: null, updatedAt: workTimestamp(row.updatedAt),
      researchCount: count(article.researchSources),
      status: row.status === 'failed' ? 'blocked' : 'draft', missing: presence.missing,
      previewUrl: null });
  }
  return items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || a.id.localeCompare(b.id));
}

export function addLivCmsDrafts(items: LivWorkItem[], cms: Awaited<ReturnType<typeof readEditorialCmsCandidates>>,
  livAuthorIds: string[], publishedIds: Set<string>, recentSince = ''): LivWorkItem[] {
  const knownIds = new Set(items.map(item => item.cmsItemId).filter(Boolean));
  const mapping = readMapping().entries;
  const extra: LivWorkItem[] = [];
  for (const row of cms.items) {
    if (row.isArchived || !row.isDraft && row.lastPublished ||
      (recentSince && (!workTimestamp(row.lastUpdated || row.createdOn) || workTimestamp(row.lastUpdated || row.createdOn)! < recentSince)) ||
      knownIds.has(row.id) || publishedIds.has(row.id) || !livAuthorIds.includes(String(row.fieldData.author || ''))) continue;
    const article = Object.fromEntries(mapping.map(field => [field.internal, row.fieldData[field.webflowSlug]]));
    const presence = draftPresence(article);
    if (presence.hasText !== true) continue;
    extra.push({ editorialRemit: assessLivTopic({ title: safeTitle(article.title), articleFormat: article.articleFormat as string | undefined }), id: row.id, cmsItemId: row.id, title: safeTitle(article.title), source: 'cms-draft',
      kind: 'scheduled', scheduledDay: null, revision: null, updatedAt: workTimestamp(row.lastUpdated || row.createdOn),
      status: 'draft', missing: presence.missing, researchCount: 0, previewUrl: null });
  }
  return [...items, ...extra].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || a.id.localeCompare(b.id));
}

/** Presentation only. Old saved text remains available without occupying the
 * current work list. Unresolved processing and prepared/future work stay visible. */
export function partitionLivWork(items: LivWorkItem[], now = new Date()) {
  const since = now.getTime() - 14 * 86400000;
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(now);
  const active = (item: LivWorkItem) => ['processing', 'prepared'].includes(item.status) ||
    Boolean(item.scheduledDay && item.scheduledDay >= day) ||
    Boolean(item.updatedAt && Date.parse(item.updatedAt) >= since);
  return { items: items.filter(active), history: items.filter(item => !active(item)) };
}

export async function readLivWorkOverview(uid: string) {
  const db = getAdminDb(); if (!db) throw Error('liv_work_store_unavailable');
  const recentSince = new Date(Date.now() - 14 * 86400000).toISOString();
  const [submissions, runs, desk, cmsResult] = await Promise.all([
    db.collection('editorialSubmissions').where('uid', '==', uid).limit(100).get(),
    db.collection('livDailyArticles').orderBy('updatedAt', 'desc').limit(100).get(),
    db.collection('editorialDesks').doc(uid).collection('stories').orderBy('updatedAt', 'desc').limit(100).get(),
    Promise.all([readEditorialCmsCandidates(100), getSubmissionOptions()]).catch(() => null),
  ]);
  const livAuthors = cmsResult?.[1].authors.filter(author => author.name.trim().toLocaleLowerCase('da') === 'liv brandt').map(author => author.id) || [];
  const items = projectLivWork(
    submissions.docs.filter(doc => doc.data().uid === uid).map(doc => ({ id: doc.id, data: doc.data() })),
    runs.docs.map(doc => ({ id: doc.id, data: doc.data() })),
    desk.docs.map(doc => ({ id: doc.id, data: doc.data() })), recentSince, livAuthors);
  const publishedIds = new Set(submissions.docs.filter(doc => doc.data().status === 'published')
    .map(doc => doc.data().publishedTarget?.itemId || doc.data().prepared?.itemId).filter((id): id is string => typeof id === 'string'));
  const all = cmsResult && livAuthors.length ? addLivCmsDrafts(items, cmsResult[0], livAuthors, publishedIds, recentSince) : items;
  return { ...partitionLivWork(all.filter(item => item.editorialRemit?.eligible)), retained: all.filter(item => !item.editorialRemit?.eligible),
    complete: submissions.size < 100 && runs.size < 100 && desk.size < 100 && !!cmsResult?.[0].complete && livAuthors.length > 0,
    checkedAt: new Date().toISOString(),
    sources: { submissions: submissions.size, livCheckpoints: runs.size, editorialDesk: desk.size,
      cmsRows: cmsResult?.[0].rowsRead ?? 0 },
  };
}
