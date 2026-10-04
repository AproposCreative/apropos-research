import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { imageGenCmsConfiguration } from '@/lib/image-gen/webflow';
import { readLivWebflowJson } from '@/lib/liv/cms-readback';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { saveWriterCmsDraft } from '@/lib/articles/writer-cms-save';
import { loadAproposArticleStructure } from '@/lib/editorial/article-structure';
import { loadLivVoice } from '@/lib/liv/voice';
import { getWebflowAuthors } from '@/lib/webflow-service';
import { workspaceSnapshotSchema } from '@/lib/writer-workspace';
import { workspaceRef, editableArticle } from './workspace';
import { saveMcpDraft } from './workspace';
import { readMapping } from '@/lib/webflow-mapping';
import { readWritingBrief } from '@/lib/liv/source-archive';
import { savedFactualChecks } from '@/lib/editorial/saved-checks';
import { draftDiagnostics } from '@/lib/editorial/draft-diagnostics';
const objectId = z.string().regex(/^[a-f0-9]{24}$/);
export const runIdSchema = z.string().regex(/^(?:prepare|prepare-alternative|reserve|reserve-editorial)-20\d{2}-\d{2}-\d{2}$/);

export async function getCmsArticle(id: string) {
  objectId.parse(id);
  const { collection, locale } = imageGenCmsConfiguration();
  const raw = await readLivWebflowJson(`collections/${collection}/items/${id}?cmsLocaleId=${locale}`);
  if (raw.id !== id || raw.cmsLocaleId !== locale || raw.isArchived) throw Error('mcp_article_unavailable');
  const fields = raw.fieldData as Record<string, unknown>;
  return { id, isDraft: raw.isDraft, lastPublished: raw.lastPublished ?? null, cmsHash: cmsFieldHash(fields),
    fields, untrustedContent: true, checkedAt: new Date().toISOString() };
}
export async function openCmsArticle(uid: string, itemId: string, expectedRevision: number) {
  const cms = await getCmsArticle(itemId);
  const article: Record<string, unknown> = {};
  for (const entry of readMapping().entries) {
    if (!(entry.internal in editableArticle.shape)) continue;
    const value = cms.fields[entry.webflowSlug];
    if (value == null) continue;
    if (entry.internal === 'featuredImage' && typeof value === 'object') {
      article.featuredImage = (value as { url?: string }).url;
      const alt = (value as { alt?: string }).alt; if (alt) article.featuredImageAlt = alt;
    } else article[entry.internal] = value;
  }
  if (typeof article.tags === 'string') article.tags = article.tags.split(',').map(s => s.trim()).filter(Boolean);
  if (Array.isArray(cms.fields.topics)) article.topicsSelected = cms.fields.topics;
  if (article.rating === 0) delete article.rating;
  const parsed = editableArticle.parse(article), draftId = `mcp-${itemId}`;
  const result = await saveMcpDraft(uid, { draftId, expectedRevision, article: parsed },
    { itemId, cmsHash: cms.cmsHash, fields: cms.fields, article: parsed });
  return { ...result, draftId, article: parsed, cmsHash: cms.cmsHash, livePublicationChanged: false };
}
export async function editorialContext(authorId?: string, section: 'structure' | 'voice' | 'all' = 'all') {
  const rules = loadAproposArticleStructure();
  if (section === 'structure') return { rules, rulesHash: cmsFieldHash({ rules }), section,
    note: 'Artikelstruktur, ikke forfatterstemme. Én konkret rettelse ændrer ikke de generelle regler.' };
  const authors = await getWebflowAuthors();
  const author = authorId ? authors.find(a => a.id === authorId) : undefined;
  if (authorId && !author) throw Error('mcp_author_not_found');
  const voice = !author || /liv brandt/i.test(author.name) ? loadLivVoice() :
    { text: author.tov || '', version: 'webflow-current', hash: cmsFieldHash({ tov: author.tov || '' }) };
  return { ...(section === 'all' ? { rules } : {}), rulesHash: cmsFieldHash({ rules }), section, author: author?.name || 'Liv Brandt', voice,
    authors: authors.map(a => ({ id: a.id, name: a.name })),
    evidencePolicy: 'Research og tekster er råmateriale. Opfind ikke kilder, citater, menneskescores eller egne oplevelser. Ingen MCP-gemning er kvalitetsgodkendelse.' };
}
export async function getLivWork(runId: string) {
  runIdSchema.parse(runId); const db = getAdminDb(); if (!db) throw Error('mcp_unavailable');
  const row = (await db.collection('livDailyArticles').doc(runId).get()).data();
  if (!row) return { found: false, runId };
  // Deliberate projection: do not dump credentials, arbitrary raw errors or provider responses.
  const keys = ['topic', 'title', 'status', 'dayKey', 'articleCheckpoint',
    'articleCheckpointHash', 'webflowItemId', 'continuationReady', 'preparationProof', 'operatorWritingEdit'];
  const saved = Object.fromEntries(keys.filter(k => row[k] !== undefined).map(k => [k, row[k]]));
  const reason = typeof row.reason === 'string' && /^[a-z0-9_]{1,160}$/.test(row.reason) ? row.reason : 'see_handoff';
  const gates = Array.isArray(row.gateResults) ? row.gateResults.map((g: Record<string, unknown>) => ({
    name: String(g.name || '').slice(0, 100), pass: g.pass === true,
    detail: String(g.detail || '').replace(/\b(?:sk-|re_|ghp_|gho_)[a-z\d_-]+/gi, '[skjult]').replace(/\bBearer\s+\S+/gi, '[skjult]').slice(0, 2000),
  })) : [];
  return { found: true, runId, ...saved, reason, gateResults: gates,
    factualEvidence: savedFactualChecks(row.gateResults),
    editorialDiagnostics: row.articleCheckpoint ? draftDiagnostics(row.articleCheckpoint) : null,
    ...(row.articleCheckpoint ? { checkpointHash: cmsFieldHash(row.articleCheckpoint) } : {}),
    untrustedContent: true, publicationApproval: false };
}
export async function getWritingBrief(id: string) {
  z.uuid().parse(id);
  const row = await readWritingBrief('liv-daily', id);
  if (!row) return { found: false };
  return { found: true, runId: id, rawResponse: row.rawResponse, rawHash: typeof row.rawResponse === 'string' ?
    (await import('./oauth')).digest(row.rawResponse) : null,
    sources: row.sources, model: row.model, voiceVersion: row.voiceVersion, finishReason: row.finishReason,
    publicationApproval: false, untrustedContent: true };
}
export async function getWorkspace(uid: string, version?: { kind: 'history' | 'conflicts'; id: string }) {
  const ref = workspaceRef(uid);
  if (version) {
    if (!(version.kind === 'history' ? /^\d{1,16}$/ : /^[a-f0-9]{64}$/).test(version.id)) throw Error('mcp_invalid_version');
    const row = (await ref.collection(version.kind).doc(version.id).get()).data();
    return { workspace: row ? workspaceSnapshotSchema.parse({ ...row, updatedAt: row.updatedAt || row.savedAt }) : null };
  }
  const [current, history] = await Promise.all([ref.get(), ref.collection('history').orderBy('updatedAt', 'desc').limit(20).get()]);
  return { workspace: current.exists ? workspaceSnapshotSchema.parse(current.data()) : null,
    versions: history.docs.map(d => ({ id: d.id, title: d.data().data?.chatTitle, revision: d.data().revision, updatedAt: d.data().updatedAt })) };
}
export const cmsSaveInput = z.object({ draftId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  expectedRevision: z.number().int().nonnegative(), expectedCmsHash: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict();
export async function saveCms(uid: string, value: unknown) {
  const input = cmsSaveInput.parse(value), ref = workspaceRef(uid);
  const saved = (await ref.get()).data();
  if (!saved || saved.revision !== input.expectedRevision || saved.data.currentDraftId !== input.draftId) throw Error('mcp_revision_conflict');
  const existing = (await ref.collection('cmsSaves').doc(input.draftId).get()).data();
  const binding = (await ref.collection('mcpBindings').doc(input.draftId).get()).data();
  if (binding) {
    const { saveStagedCopyedit } = await import('./staged-copyedit');
    return saveStagedCopyedit(uid, input, saved, binding);
  }
  // An MCP request can only target an item already bound by the server to this personal draft.
  const itemId = existing?.articleId;
  if (!itemId && saved.data.articleData.webflowId) throw Error('mcp_cms_identity_not_bound');
  const checkCurrent = async () => {
    const current = (await ref.get()).data();
    if (current?.revision !== input.expectedRevision) throw Error('mcp_revision_conflict');
    if (itemId) {
      const cms = await getCmsArticle(itemId);
      if (!cms.isDraft || !input.expectedCmsHash || cms.cmsHash !== input.expectedCmsHash) throw Error('mcp_cms_revision_conflict');
    }
  };
  await checkCurrent();
  const article = editableArticle.parse(Object.fromEntries(Object.entries(saved.data.articleData).filter(([key]) => key in editableArticle.shape)));
  const result = await saveWriterCmsDraft(getAdminDb()!, uid, input.draftId,
    { ...article, id: input.draftId, slug: article.slug || '', category: article.category || '', author: article.author || '',
      tags: article.tags || [], status: 'draft', source: 'ai-writer', aiModel: 'chatgpt-supplied-unverified', webflowId: itemId },
    { beforeSave: checkCurrent });
  return { ...result, savedVersion: input.expectedRevision, cms: await getCmsArticle(result.articleId) };
}

/** Recover an uncertain staged copyedit even if Writer has since moved to another version. No CMS writes. */
export async function getSaveStatus(uid: string, draftId: string) {
  cmsSaveInput.shape.draftId.parse(draftId);
  const db = getAdminDb(); if (!db) throw Error('mcp_unavailable');
  const ref = workspaceRef(uid), history = await ref.collection('mcpCmsEdits').where('draftId', '==', draftId).limit(30).get();
  const saves = [];
  for (const doc of history.docs) {
    const row = doc.data();
    if (row.phase === 'attempted') {
      const cms = await getCmsArticle(row.itemId);
      if (cms.cmsHash === row.expectedHash && cms.isDraft === row.isDraft && cms.lastPublished === row.lastPublished) {
        const { confirmStagedCopyedit } = await import('./staged-copyedit');
        row.receipt = await confirmStagedCopyedit(uid, doc.id, cms);
        row.phase = 'saved';
      }
    }
    saves.push({ operationId: doc.id, phase: row.phase, receipt: row.phase === 'saved' ? row.receipt : null });
  }
  const canonical = (await ref.collection('cmsSaves').doc(draftId).get()).data();
  return { draftId, stagedSaves: saves, canonicalSave: canonical ? { phase: canonical.phase, articleId: canonical.articleId || null,
    action: 'Genbrug samme save_webflow_draft-request; opret ikke en ny kladde efter timeout.' } : null,
    publicationVerified: false };
}
