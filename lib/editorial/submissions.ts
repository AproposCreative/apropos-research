import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { MCP_ORIGIN } from '@/lib/mcp/config';
import { getSubmissionOptions } from './submission-options';
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
  return { ...row, ...inspection, status: row.status === 'draft' ?
    (inspection.questions.length ? 'awaiting_answers' : 'awaiting_preparation') : row.status,
    previewUrl: `${MCP_ORIGIN}/connect/chatgpt?submission=${id}`,
    preparationStarted: row.status === 'processing',
    textPreserved: row.article.content === row.originalArticle.content,
    savedSteps,
    displayNames: { author: options.authors.find(a => a.id === row.article.author || a.name === row.article.author)?.name ?? row.article.author,
      category: options.categories.find(c => c.id === row.article.category || c.name === row.article.category)?.name ?? row.article.category },
    availableActions: ['draft', 'blocked'].includes(row.status) ? ['update_submission', 'get_submission_status', 'find_submission_images'] : ['get_submission_status'],
    handoff: { submissionId: id, revision: row.revision, contentHash: row.contentHash,
      saved: ['article', 'research', 'choices', 'originalArticle'],
      missing: [...inspection.questions.map(q => q.field), ...inspection.missingMetadata, ...inspection.missingMedia, ...inspection.blockers],
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
  const input = submissionInput.parse(raw); validateSubmissionArticle(input.article);
  const id = cmsFieldHash({ uid, requestId: input.requestId }), contentHash = submissionVersion(input);
  const { db, collection } = submissionStore(), ref = collection.doc(id);
  await db.runTransaction(async tx => {
    const old = (await tx.get(ref)).data();
    if (old) {
      if (old.uid !== uid || old.initialHash !== contentHash) throw Error('mcp_submission_idempotency_conflict');
      return;
    }
    const now = new Date().toISOString();
    tx.create(ref, { ...input, id, uid, revision: 1, contentHash, initialHash: contentHash,
      executionPolicy: 'chat-final-checks-v1',
      originalArticle: input.article, status: 'draft', createdAt: now, updatedAt: now });
  });
  return getSubmissionStatus(uid, id);
}

export async function updateSubmission(uid: string, raw: unknown) {
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
    if (!['draft', 'awaiting_answers', 'awaiting_preparation', 'blocked', 'prepared'].includes(row.status)) throw Error('mcp_submission_operation_pending');
    // A title/metadata correction must not discard completed images. Keep the
    // prepared body/cover, while preserving the original author text separately.
    const prepared = (row as SubmissionRecord & { prepared?: { expected?: SubmissionRecord['article'] } }).prepared?.expected;
    const base = row.status === 'prepared' && prepared ? { ...row.article, content: prepared.content,
      featuredImage: prepared.featuredImage, featuredImageAlt: prepared.featuredImageAlt, fotoCredit: prepared.fotoCredit } : row.article;
    const article = { ...base, ...input.article };
    for (const field of input.clearFields || []) {
      if (input.article?.[field] !== undefined) throw Error('mcp_submission_conflicting_update');
      delete article[field];
    }
    const next = submissionInput.parse({ requestId: row.requestId, article,
      research: input.research ?? row.research, choices: { ...row.choices, ...input.choices } });
    validateSubmissionArticle(next.article);
    const revision = row.revision + 1, now = new Date().toISOString();
    tx.create(ref.collection('versions').doc(String(row.revision)), row);
    tx.update(ref, { ...next, revision, contentHash: submissionVersion(next), status: 'draft', updatedAt: now });
    tx.create(receipt, { requestHash, revision, createdAt: now });
  });
  return getSubmissionStatus(uid, input.submissionId);
}
