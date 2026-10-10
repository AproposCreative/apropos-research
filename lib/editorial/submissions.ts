import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { MCP_ORIGIN } from '@/lib/mcp/config';
import { getSubmissionOptions } from './submission-options';
import { assertMediaOnlyUpdate } from './submission-published-target';
import { getReaderProgress } from '@/lib/mcp/reader';
import { articleImages } from '@/lib/mcp/markup';
import { projectImageSelection } from './submission-image-selection';
import { livProductionSubmissionId } from './liv-production-identity';
import { assertChatGptFirstPolicy } from './submission-policy';
import { inspectSubmission, submissionId, submissionInput, submissionUpdate, submissionVersion,
  validateSubmissionArticle, type SubmissionRecord } from './submission-contract';

export function submissionStore() {
  const db = getAdminDb(); if (!db) throw Error('mcp_submission_store_unavailable');
  return { db, collection: db.collection('editorialSubmissions') };
}
export async function readSubmission(uid: string, id: string): Promise<SubmissionRecord> {
  submissionId.parse(id);
  const row = (await submissionStore().collection.doc(id).get()).data() as SubmissionRecord | undefined;
  if (!row || row.uid !== uid || row.id !== id) throw Error('mcp_submission_not_found');
  return row;
}
export async function getSubmissionStatus(uid: string, id: string) {
  const row = await readSubmission(uid, id);
  const options = await getSubmissionOptions().catch(() => ({ authors: [], categories: [], topics: [], requiredFields: [], checkedAt: '' }));
  const inspection = inspectSubmission(row, options);
  const stages = await submissionStore().collection.doc(id).collection('stages').limit(40).get();
  const savedSteps = stages.docs.map(doc => {
    const step = doc.data();
    return { id: doc.id, name: step.name, contentHash: step.contentHash, status: step.status,
      startedAt: step.startedAt, completedAt: step.completedAt ?? null,
      result: step.status === 'done' ? step.result : null, checks: step.checks ?? null,
      cmsAsset: step.cmsAsset ?? null };
  });
  const assetReceipts = await submissionStore().collection.doc(id).collection('chatAssets').limit(101).get();
  if (assetReceipts.size > 100) throw Error('mcp_submission_media_window_exceeded');
  const imageSelection = projectImageSelection(row, assetReceipts.docs.map(doc => doc.data()));
  const publication = (row as typeof row & { publication?: { receipt?: { mediaIdentity?: {
    cmsHash: string; checkedAt: string; assets: Array<{ assetId: string; published: Array<{ url: string; hash: string }> }> } } } }).publication;
  const verified = publication?.receipt?.mediaIdentity;
  const receiptMatches = row.status === 'published' && verified?.cmsHash === row.publishedTarget?.fieldDataHash;
  const selectedUrls = new Set([row.article.featuredImage, ...articleImages(row.article.content).map(image => image.url)]);
  const mediaIdentity = assetReceipts.docs.map(doc => doc.data()).filter(asset => asset.status === 'attached' && selectedUrls.has(asset.url))
    .map(asset => {
      const published = receiptMatches ? verified?.assets.find(item => item.assetId === asset.assetId) : undefined;
      return { assetId: asset.assetId, role: asset.role, sectionId: asset.sectionId ?? null, locked: asset.locked === true,
      requestedAsset: { fileId: asset.fileId, hash: asset.originalHash }, actualStoredAsset: { url: asset.url, hash: asset.hash },
      actualPublishedAsset: published?.published[0] ?? null,
      publicationVerified: !!published, verifiedAt: published ? verified!.checkedAt : null,
      verification: published ? 'saved_publication_readback' : 'not_verified', fallbackUsed: asset.fallbackUsed === true }; });
  return { ...row, ...inspection, status: row.status === 'draft' ?
    (inspection.questions.length ? 'awaiting_answers' : 'awaiting_preparation') : row.status,
    previewUrl: `${MCP_ORIGIN}/connect/chatgpt?submission=${id}`,
    preparationStarted: row.status === 'processing',
    textPreserved: row.article.content === row.originalArticle.content,
    savedSteps, mediaIdentity, imageSelection,
    mediaImports: assetReceipts.docs.map(doc => { const asset = doc.data(); return { assetId: doc.id, status: asset.status,
      ready: ['uploaded', 'attached'].includes(asset.status), role: asset.role, failure: asset.failure ?? null,
      originalPreserved: !!asset.storagePath, cmsAssetId: asset.cmsAsset?.id ?? null,
      generationEvidence: asset.generationEvidence ?? null, regenerateImage: false }; }),
    displayNames: { author: options.authors.find(a => a.id === row.article.author || a.name === row.article.author)?.name ?? row.article.author,
      category: options.categories.find(c => c.id === row.article.category || c.name === row.article.category)?.name ?? row.article.category },
    availableActions: ['draft', 'blocked', 'prepared', 'published'].includes(row.status) ? ['update_submission', 'import_submission_image', 'preview_submission', 'get_submission_status'] : ['get_submission_status'],
    handoff: { submissionId: id, revision: row.revision, contentHash: row.contentHash,
      saved: ['article', 'research', 'choices', 'originalArticle'],
      missing: [...inspection.questions.map(q => q.field), ...inspection.missingMetadata, ...inspection.missingMedia, ...inspection.blockers],
      recommendedMedia: inspection.recommendedMedia,
      publicationReady: false,
      nextAction: row.status === 'prepared' ? 'open_personal_preview_for_fresh_checks_and_approval' :
        row.status === 'blocked' ? 'inspect_saved_step_before_any_retry' :
        ['processing', 'scheduled'].includes(row.status) ? 'read_saved_status_do_not_resubmit' :
        row.status === 'published' ? 'inspect_publication_receipt' :
        inspection.readyForPreparation ? 'open_personal_price_acceptance' : 'complete_missing_inputs' } };
}

export async function listSubmissions(uid: string) {
  const result = await submissionStore().collection.where('uid', '==', uid).limit(100).get();
  return { submissions: result.docs.map(doc => {
    const row = doc.data();
    return { id: doc.id, title: row.article?.title, revision: row.revision, status: row.status,
      updatedAt: row.updatedAt, blocker: row.blocker ?? null, blockedStep: row.blockedStep ?? null,
      previewUrl: `${MCP_ORIGIN}/connect/chatgpt?submission=${doc.id}` };
  }).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    boundedTo: 100, complete: result.size < 100, paidAiCalls: 0 };
}

export async function prepareSubmission(uid: string, raw: unknown) {
  const input = submissionInput.parse(raw);
  const reader = input.readerSourceId ? await getReaderProgress(uid, { sourceId: input.readerSourceId, limit: 1 }) : null;
  if (reader) {
    if (!reader.coverage.some(c => c.status === 'reported_complete')) throw Error('mcp_submission_reader_incomplete');
    if ((input.article.bookTitle && input.article.bookTitle !== reader.title) ||
        (input.article.bookAuthor && input.article.bookAuthor !== reader.author)) throw Error('mcp_submission_reader_identity_conflict');
    input.article.bookTitle = reader.title; input.article.bookAuthor = reader.author;
  }
  validateSubmissionArticle(input.article);
  const id = input.livProduction ? livProductionSubmissionId(uid, input.livProduction) : cmsFieldHash({ uid, requestId: input.requestId });
  const { db, collection } = submissionStore(), ref = collection.doc(id);
  await db.runTransaction(async tx => {
    const old = (await tx.get(ref)).data();
    if (old) {
      // Keep pre-migration retries byte/version compatible; never migrate an approval implicitly.
      const retry = old.executionPolicy === 'chatgpt-first-v1' ? { ...input, choices: { ...input.choices, aiFinalChecks: input.choices.aiFinalChecks || 'human' as const } } : input;
      if (old.uid !== uid || old.initialHash !== submissionVersion(retry)) {
        throw Error(input.livProduction ? 'mcp_submission_production_exists' : 'mcp_submission_idempotency_conflict');
      }
      return;
    }
    input.choices.aiFinalChecks ||= 'human';
    assertChatGptFirstPolicy({ executionPolicy: 'chatgpt-first-v1', choices: input.choices });
    const contentHash = submissionVersion(input);
    const now = new Date().toISOString();
    tx.create(ref, { ...input, id, uid, revision: 1, contentHash, initialHash: contentHash,
      executionPolicy: 'chatgpt-first-v1',
      ...(reader ? { readerEvidence: { sourceId: reader.sourceId, revision: reader.revision, coverage: reader.coverage,
        independentlyVerified: false, basis: 'saved_position_bound_notes', publicationApproval: false } } : {}),
      originalArticle: input.article, status: 'draft', createdAt: now, updatedAt: now });
  });
  return getSubmissionStatus(uid, id);
}

export async function updateSubmission(uid: string, raw: unknown, internal?: { replaceUrls: string[] }) {
  const input = submissionUpdate.parse(raw), { db, collection } = submissionStore();
  const ref = collection.doc(input.submissionId), receipt = ref.collection('updates').doc(cmsFieldHash({ requestId: input.requestId }));
  const requestHash = cmsFieldHash(input);
  await db.runTransaction(async tx => {
    const row = (await tx.get(ref)).data() as SubmissionRecord | undefined;
    const prior = (await tx.get(receipt)).data();
    if (!row || row.uid !== uid) throw Error('mcp_submission_not_found');
    if (prior) {
      if (prior.requestHash !== requestHash) throw Error('mcp_submission_idempotency_conflict');
      return;
    }
    if (row.revision !== input.expectedRevision) throw Error('mcp_submission_revision_conflict');
    if (!['draft', 'awaiting_answers', 'awaiting_preparation', 'blocked', 'prepared', 'published'].includes(row.status) ||
        (row.status === 'published' && !row.publishedTarget)) throw Error('mcp_submission_operation_pending');
    // A title/metadata correction must not discard completed images. Keep the
    // prepared body/cover, while preserving the original author text separately.
    const prepared = (row as SubmissionRecord & { prepared?: { expected?: SubmissionRecord['article'] } }).prepared?.expected;
    const base = ['prepared', 'published'].includes(row.status) && prepared ? { ...row.article, content: prepared.content,
      featuredImage: prepared.featuredImage, featuredImageAlt: prepared.featuredImageAlt, fotoCredit: prepared.fotoCredit } : row.article;
    const article = { ...base, ...input.article };
    for (const field of input.clearFields || []) {
      if (input.article?.[field] !== undefined) throw Error('mcp_submission_conflicting_update');
      delete article[field];
    }
    const next = submissionInput.parse({ requestId: row.requestId, readerSourceId: row.readerSourceId, livProduction: row.livProduction, article,
      research: input.research ?? row.research, choices: { ...row.choices, ...input.choices } });
    assertChatGptFirstPolicy({ executionPolicy: row.executionPolicy, choices: next.choices });
    validateSubmissionArticle(next.article);
    const beforeUrls = [base.featuredImage, ...articleImages(base.content).map(image => image.url)].filter((url): url is string => !!url);
    const afterUrls = new Set([next.article.featuredImage, ...articleImages(next.article.content).map(image => image.url)]);
    for (const url of beforeUrls.filter(url => !afterUrls.has(url) && !internal?.replaceUrls.includes(url))) {
      const lock = (await tx.get(db.collection('editorialProvidedAssets').doc(cmsFieldHash({ url })))).data();
      if (lock?.preserveOriginal && lock.url === url) throw Error('mcp_submission_selected_asset_locked');
    }
    if (row.publishedTarget) assertMediaOnlyUpdate(row.article, next.article);
    const revision = row.revision + 1, now = new Date().toISOString();
    tx.create(ref.collection('versions').doc(String(row.revision)), row);
    tx.update(ref, { ...next, revision, contentHash: submissionVersion(next, row.publishedTarget), status: 'draft', updatedAt: now });
    tx.create(receipt, { requestHash, revision, createdAt: now });
  });
  return getSubmissionStatus(uid, input.submissionId);
}
