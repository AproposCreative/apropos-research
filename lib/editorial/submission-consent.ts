import { load } from 'cheerio';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { normalizeArticlePayload } from '@/lib/articles/article-payload';
import { assertPublicationEnabled } from '@/lib/mcp/publication';
import { activeMember } from '@/lib/mcp/oauth';
import { readSubmission, submissionStore } from './submissions';
import { getSubmissionOptions } from './submission-options';
import { inspectSubmission, type SubmissionRecord } from './submission-contract';
import { readImageSelection } from './submission-image-selection';
import { requestedEditorialDecision } from './submission-policy';
import { copenhagenPublicationInstant } from './submission-publication';
import { articleImages } from '@/lib/mcp/markup';
import type { Transaction } from 'firebase-admin/firestore';
import { hasCurrentPublicationConsent } from './submission-consent-state';

export type PublicationConsent = {
  id: string; uid: string; revision: number; contentHash: string; articleHash: string;
  selectionHash: string; acceptedAt: string; source: 'chat-preview' | 'external-preview';
  localTime: string; publishAt: string; media: Array<{ url: string; hash: string }>;
  status: 'pending' | 'scheduled'; preparedHash?: string;
};

async function consentMedia(row: SubmissionRecord, tx?: Transaction) {
  const query = submissionStore().collection.doc(row.id).collection('chatAssets').limit(101);
  const result = await (tx ? tx.get(query) : query.get());
  if (result.size > 100) throw Error('mcp_submission_media_window_exceeded');
  const urls = new Set([row.article.featuredImage, ...articleImages(row.article.content).map(image => image.url)]);
  return result.docs.map(doc => doc.data()).filter(asset => asset.uid === row.uid && ['uploaded', 'attached'].includes(asset.status) && urls.has(asset.url))
    .map(asset => ({ url: String(asset.url), hash: String(asset.hash || asset.originalHash) })).sort((a, b) => a.url.localeCompare(b.url));
}

/** Compare everything editorial, allowing only non-editorial serialization and
 * image dimensions. Any other preparation change needs a fresh personal preview. */
export function consentArticleHash(article: Record<string, unknown>, kind?: string) {
  const normalized = normalizeArticlePayload({ ...article, title: String(article.title || ''), content: String(article.content || ''),
    articleFormat: kind === 'review' || article.articleFormat === 'research-review' ? 'research-review' : 'article',
    aiGenerated: false, aiModel: 'chatgpt-supplied-unverified', source: 'manual' });
  const $ = load(normalized.content);
  $('img').removeAttr('width height loading decoding');
  const { id: _id, webflowId: _webflow, publishDate: _date, status: _status,
    wordCount: _words, readTime: _time, workflowState: _workflow, sourceArticleId: _source,
    featuredImageHash: _hash, ...editorial } = normalized;
  return cmsFieldHash({ ...editorial, content: $('body').html()?.trim() || '' });
}

export async function submissionConsentOffer(uid: string, id: string) {
  const row = await readSubmission(uid, id);
  if (hasCurrentPublicationConsent(row) && (row as SubmissionRecord & { publicationConsentPending?: boolean }).publicationConsentPending) return null;
  if (row.executionPolicy !== 'chatgpt-first-v1' || row.choices.aiFinalChecks !== 'human' ||
    !['draft', 'prepared'].includes(row.status)) return null;
  const inspection = inspectSubmission(row, await getSubmissionOptions());
  if (!inspection.readyForPreparation || inspection.missingMedia.length) return null;
  const selection = await readImageSelection(row);
  const prepared = (row as SubmissionRecord & { prepared?: { expected: Record<string, unknown> }; preparedHash?: string });
  const articleHash = consentArticleHash(prepared.prepared?.expected && row.status === 'prepared' ? prepared.prepared.expected : row.article, row.choices.kind);
  const body = { uid, revision: row.revision, contentHash: row.contentHash, articleHash, media: await consentMedia(row),
    selectionHash: selection.selectionHash, ...(row.status === 'prepared' ? { preparedHash: prepared.preparedHash } : {}) };
  return { ...body, id: cmsFieldHash({ contract: 'single-publication-consent-v1', ...body }),
    label: 'Godkend og udgiv', includesPersonalImageSelection: selection.required, paidAiCalls: 0 };
}

/** Personal UI only. One atomic write records the single consent and queues the
 * existing worker; no network side effect can be duplicated on a lost response. */
export async function acceptSubmissionConsent(uid: string, id: string, expectedRevision: number, consentId: string,
  source: PublicationConsent['source'], localTime = 'now') {
  assertPublicationEnabled();
  const acceptedAt = new Date().toISOString();
  if (!await activeMember(uid, Date.parse(acceptedAt))) throw Error('mcp_submission_owner_access_changed');
  const { db, collection } = submissionStore(), ref = collection.doc(id);
  const before = await readSubmission(uid, id);
  const prior = (before as SubmissionRecord & { publicationConsent?: PublicationConsent }).publicationConsent;
  if (prior?.id === consentId && prior.uid === uid && prior.revision === expectedRevision && before.revision === expectedRevision && prior.contentHash === before.contentHash && prior.localTime === localTime) {
    return { accepted: true, replay: true, submissionId: id, queuedOnServer: true, paidAiCalls: 0 };
  }
  const offer = await submissionConsentOffer(uid, id);
  if (!offer || offer.id !== consentId || offer.revision !== expectedRevision) throw Error('mcp_submission_preview_changed');
  const publishAt = copenhagenPublicationInstant(localTime);
  return db.runTransaction(async tx => {
    const row = (await tx.get(ref)).data() as SubmissionRecord & { publicationConsent?: PublicationConsent; preparedHash?: string; prepared?: { expected: Record<string, unknown> } };
    if (!row || row.uid !== uid || row.revision !== offer.revision || row.contentHash !== offer.contentHash) throw Error('mcp_submission_preview_changed');
    if (row.publicationConsent?.id === consentId) {
      if (row.publicationConsent.localTime !== localTime) throw Error('mcp_submission_preview_changed');
      return { accepted: true, replay: true, submissionId: id, queuedOnServer: true, paidAiCalls: 0 };
    }
    if (row.executionPolicy !== 'chatgpt-first-v1' || row.choices.aiFinalChecks !== 'human' || !['draft', 'prepared'].includes(row.status)) throw Error('mcp_submission_operation_pending');
    const selection = await readImageSelection(row, tx);
    const media = await consentMedia(row, tx);
    if (cmsFieldHash({ media }) !== cmsFieldHash({ media: offer.media }) || selection.selectionHash !== offer.selectionHash || (row.status === 'prepared' && row.preparedHash !== offer.preparedHash)) throw Error('mcp_submission_preview_changed');
    const consent: PublicationConsent = { id: consentId, uid, revision: row.revision, contentHash: row.contentHash,
      articleHash: offer.articleHash, selectionHash: selection.selectionHash, acceptedAt, source, status: 'pending', localTime, publishAt, media,
      ...(offer.preparedHash ? { preparedHash: offer.preparedHash } : {}) };
    const approval = { uid, quoteId: consentId, contentHash: row.contentHash, editorialDecision: requestedEditorialDecision(row),
      executionPolicy: row.executionPolicy, ceilingDkkMicros: 0, acceptedAt, consentId };
    const mediaSelection = { uid, revision: row.revision, contentHash: row.contentHash, selectionHash: selection.selectionHash, acceptedAt };
    tx.create(ref.collection('publicationConsents').doc(consentId), consent);
    if (selection.required) tx.set(ref.collection('mediaSelections').doc(selection.selectionHash), {
      ...mediaSelection, items: selection.items, exactPromptExecutionVerified: false, consentId });
    if (row.status === 'draft') tx.create(ref.collection('approvals').doc(consentId), approval);
    tx.update(ref, { publicationConsent: consent, publicationConsentPending: true,
      ...(selection.required ? { mediaSelection } : {}),
      ...(row.status === 'draft' ? { approval, packageReservedDkkMicros: 0, status: 'processing', nextStep: 'media' } : {}), updatedAt: acceptedAt });
    return { accepted: true, replay: false, submissionId: id, queuedOnServer: true, paidAiCalls: 0 };
  });
}

export function assertPublicationConsent(row: SubmissionRecord & { publicationConsent?: PublicationConsent; prepared?: { expected: Record<string, unknown> }; preparedHash?: string; assets?: Array<{ url: string; hash: string }> }, id: string) {
  const consent = row.publicationConsent;
  if (!consent || consent.id !== id || consent.uid !== row.uid || consent.revision !== row.revision ||
    consent.contentHash !== row.contentHash || row.executionPolicy !== 'chatgpt-first-v1' || row.choices.aiFinalChecks !== 'human' ||
    !row.prepared || (consent.preparedHash && consent.preparedHash !== row.preparedHash) ||
    consent.articleHash !== consentArticleHash(row.prepared.expected, row.choices.kind) ||
    consent.media.some(media => !row.assets?.some(asset => asset.url === media.url && asset.hash === media.hash))) throw Error('mcp_submission_preview_changed');
  return consent;
}
