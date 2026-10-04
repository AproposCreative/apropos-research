import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { imageGenCmsConfiguration } from '@/lib/image-gen/webflow';
import { readMapping } from '@/lib/webflow-mapping';
import { assertArticleMarkupSafe, articleImages, articleAssetSignature } from './markup';
import { getCmsArticle } from './editorial';
import { workspaceRef, editableArticle } from './workspace';

// Targeted staged copyedits only. Media/reference/URL edits use the dedicated tools.
const copyFields = new Set(['title', 'content', 'subtitle', 'intro', 'excerpt', 'seoTitle', 'seoDescription', 'rating']);
type Row = Record<string, any>;
export async function saveStagedCopyedit(uid: string, input: { draftId: string; expectedRevision: number; expectedCmsHash?: string },
  saved: Row, binding: Row) {
  const db = getAdminDb(); if (!db) throw Error('mcp_unavailable');
  const article = editableArticle.parse(Object.fromEntries(Object.entries(saved.data.articleData).filter(([key]) => key in editableArticle.shape)));
  assertArticleMarkupSafe(article.content);
  const patch: Record<string, unknown> = {};
  const changed = Object.keys(article).filter(key => cmsFieldHash({ value: article[key as keyof typeof article] }) !== cmsFieldHash({ value: binding.article[key] }));
  if (changed.some(key => !copyFields.has(key))) throw Error('mcp_use_dedicated_media_or_metadata_editor');
  if (cmsFieldHash({ images: articleImages(article.content) }) !== cmsFieldHash({ images: articleImages(String(binding.article.content || '')) })) throw Error('mcp_use_dedicated_media_or_metadata_editor');
  if (cmsFieldHash({ assets: articleAssetSignature(article.content) }) !== cmsFieldHash({ assets: articleAssetSignature(String(binding.article.content || '')) })) throw Error('mcp_use_dedicated_media_or_metadata_editor');
  for (const key of changed) {
    const mapping = readMapping().entries.find(e => e.internal === key);
    if (!mapping || !(mapping.webflowSlug in binding.fields)) throw Error('mcp_cms_field_unavailable');
    patch[mapping.webflowSlug] = article[key as keyof typeof article];
  }
  const ref = workspaceRef(uid), operationId = cmsFieldHash({ draftId: input.draftId, revision: input.expectedRevision, patch });
  const opRef = ref.collection('mcpCmsEdits').doc(operationId);
  const lock = db.collection('mcpCmsLocks').doc(binding.itemId);
  const old = (await opRef.get()).data();
  if (old?.phase === 'saved') return { ...old.receipt, replay: true };
  const current = await getCmsArticle(binding.itemId);
  const expected = { ...binding.fields, ...patch };
  const receipt = { articleId: binding.itemId, publicationVerified: false, stagedOnly: true,
    cmsHash: cmsFieldHash(expected), savedVersion: input.expectedRevision, changedFields: Object.keys(patch) };
  if (old?.phase === 'attempted') {
    if (current.cmsHash !== receipt.cmsHash || current.isDraft !== old.isDraft || current.lastPublished !== old.lastPublished) throw Error('mcp_cms_save_reconciliation_required');
    await db.runTransaction(async tx => {
      const held = (await tx.get(lock)).data();
      tx.update(opRef, { phase: 'saved', receipt });
      if (held?.operationId === operationId && held.uid === uid) tx.delete(lock);
    });
    return { ...receipt, replay: true };
  }
  if (!input.expectedCmsHash || current.cmsHash !== input.expectedCmsHash || current.cmsHash !== binding.cmsHash) throw Error('mcp_cms_revision_conflict');
  if (!changed.length) return { ...receipt, noChanges: true };
  if (changed.some(k => k === 'seoTitle' || k === 'seoDescription')) {
    const { assertEditorialMetadataWritable } = await import('@/lib/seo-engine/post-publish/editorial');
    await assertEditorialMetadataWritable(binding.itemId, 'da', changed.flatMap(k => k === 'seoTitle' ? ['seoTitle' as const] : k === 'seoDescription' ? ['metaDescription' as const] : []));
  }
  await db.runTransaction(async tx => {
    const workspace = (await tx.get(ref)).data(), held = (await tx.get(lock)).data();
    const operation = (await tx.get(opRef)).data();
    if (operation || held) throw Error('mcp_cms_save_reconciliation_required');
    if (workspace?.revision !== input.expectedRevision || workspace.data.currentDraftId !== input.draftId) throw Error('mcp_revision_conflict');
    tx.create(opRef, { phase: 'attempted', expectedHash: receipt.cmsHash, itemId: binding.itemId, draftId: input.draftId, receipt,
      isDraft: current.isDraft, lastPublished: current.lastPublished, createdAt: new Date().toISOString() });
    tx.create(lock, { operationId, uid });
  });
  // An ambiguous write is never retried. Its next invocation only reads/reconciles.
  let latest;
  try {
    latest = await getCmsArticle(binding.itemId);
    if (latest.cmsHash !== current.cmsHash || latest.isDraft !== current.isDraft || latest.lastPublished !== current.lastPublished) throw Error('mcp_cms_revision_conflict');
  } catch (error) {
    // Still before PATCH: a failed read here is a definitive pre-write abort.
    await db.runTransaction(async tx => {
      const held = (await tx.get(lock)).data();
      tx.update(opRef, { phase: 'rejected_before_write' });
      if (held?.operationId === operationId && held.uid === uid) tx.delete(lock);
    });
    throw error;
  }
  const { token, collection, locale } = imageGenCmsConfiguration();
  const response = await fetch(`https://api.webflow.com/v2/collections/${collection}/items/${binding.itemId}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmsLocaleId: locale, fieldData: patch }), redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error('mcp_cms_save_reconciliation_required');
  const after = await getCmsArticle(binding.itemId);
  if (after.cmsHash !== receipt.cmsHash || after.isDraft !== current.isDraft || after.lastPublished !== current.lastPublished) throw Error('mcp_cms_save_reconciliation_required');
  await db.runTransaction(async tx => {
    const held = (await tx.get(lock)).data();
    tx.update(opRef, { phase: 'saved', receipt });
    if (held?.operationId === operationId && held.uid === uid) tx.delete(lock);
  });
  return receipt;
}
