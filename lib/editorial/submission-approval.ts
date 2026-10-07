import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { validateLivCostPolicy } from '@/lib/liv/cost-ledger';
import { imageGenQuotes } from '@/lib/image-gen/quotes';
import { readProviderHold } from '@/lib/ai/provider-hold';
import { readSubmission, submissionStore } from './submissions';
import { getSubmissionOptions } from './submission-options';
import { inspectSubmission } from './submission-contract';
import { requestedEditorialDecision } from './submission-policy';
import { readImageSelection, assertImageSelection } from './submission-image-selection';
import type { SubmissionRecord } from './submission-contract';

/** Price acceptance is separate from publication approval. Both are first-party only. */
export async function quoteSubmission(uid: string, id: string) {
  const row = await readSubmission(uid, id), options = await getSubmissionOptions();
  const inspection = inspectSubmission(row, options);
  const imageSelection = await readImageSelection(row);
  const finalOnly = row.executionPolicy === 'chat-final-checks-v1';
  const editorialDecision = requestedEditorialDecision(row);
  const humanReview = finalOnly && editorialDecision.aiFinalChecks === 'human';
  const { db } = submissionStore();
  // Free deterministic preparation must not depend on paid pricing/style config.
  const shared = humanReview ? { usdToDkkCeiling: 0 } : validateLivCostPolicy((await db.collection('livCostLedger').doc('policy').get()).data());
  const images = humanReview ? { usdToDkkCeiling: 0 } : validateLivCostPolicy((await db.collection('imageGenCostLedger').doc('policy').get()).data());
  const quotes = humanReview ? { ideas: { estimateUpToDkk: 0 }, generate: { estimateUpToDkk: 0 } } : await imageGenQuotes();
  const count = inspection.missingMedia.length;
  const generation = row.choices.media === 'illustration' ? count : 0;
  // Operational package bounds, not invoices. Every underlying provider call
  // must also reserve against this accepted ceiling, including nested cleanup.
  const lines = humanReview ? [{ step: 'Menneskelig godkendelse og deterministisk CMS-/billedkontrol. Ingen AI-kald.', estimateDkk: 0 }] : finalOnly ? [
    { step: 'Visuel slutkontrol af dine billeder (ingen generation eller tekstrensning)', estimateDkk: Math.ceil(images.usdToDkkCeiling * 0.05 * 100) / 100 },
    { step: 'Redaktionelle og faktuelle slutkontroller', estimateDkk: Math.ceil(shared.usdToDkkCeiling * 0.25 * 100) / 100 },
  ] : [
    { step: 'Billedidéer og afgrænset pressesøgning', estimateDkk: count ? quotes.ideas.estimateUpToDkk : 0 },
    { step: 'Nye illustrationer', estimateDkk: generation * quotes.generate.estimateUpToDkk },
    { step: 'Billedkontrol og eventuel tekstrensning', estimateDkk: Math.ceil(images.usdToDkkCeiling * 0.30 * 100) / 100 },
    { step: 'Redaktionelle kontroller', estimateDkk: Math.ceil(shared.usdToDkkCeiling * 0.25 * 100) / 100 },
  ];
  const estimateDkk = Math.ceil(lines.reduce((sum, line) => sum + line.estimateDkk, 0) * 100) / 100;
  // Reservations use conservative token/reference bounds rather than the image
  // price alone. Stop, never purchase beyond the displayed accepted ceiling.
  const ceilingDkkMicros = humanReview ? 0 : Math.ceil((finalOnly ? 0.15 * images.usdToDkkCeiling + 0.5 * shared.usdToDkkCeiling :
    generation * 0.7 * images.usdToDkkCeiling + 0.9 * images.usdToDkkCeiling + 0.5 * shared.usdToDkkCeiling) * 1e6);
  const body = { contentHash: row.contentHash, revision: row.revision, lines, estimateDkk,
    ceilingDkkMicros, policyHash: cmsFieldHash({ shared, images, quotes }),
    executionPolicy: row.executionPolicy || 'legacy-preparation', editorialDecision, humanReview,
    kind: 'estimate-not-provider-invoice', autoRetry: false };
  return { ...body, quoteId: cmsFieldHash(body), canAccept: !imageSelection.required && inspection.readyForPreparation && (!finalOnly || count === 0),
    blockers: [...inspection.blockers, ...(imageSelection.required ? ['image_selection_required'] : []), ...(finalOnly && count ? ['chat_images_required'] : [])], provider: await readProviderHold(),
    instruction: 'Kræver din personlige prisaccept. Ikke publiceringsgodkendelse. Ingen automatisk genbestilling. Chatforløb køber kun slutkontroller.' };
}

export async function acceptSubmissionQuote(uid: string, id: string, expectedRevision: number, quoteId: string) {
  const quote = await quoteSubmission(uid, id);
  if (!quote.canAccept || quote.quoteId !== quoteId || quote.revision !== expectedRevision) throw Error('mcp_submission_quote_changed');
  if (quote.provider.blocked && !quote.humanReview) throw Error('mcp_submission_provider_blocked');
  const { db, collection } = submissionStore(), ref = collection.doc(id);
  return db.runTransaction(async tx => {
    const row = (await tx.get(ref)).data();
    if (!row || row.uid !== uid || row.revision !== expectedRevision || row.contentHash !== quote.contentHash) throw Error('mcp_submission_revision_conflict');
    if (row.approval?.quoteId === quoteId) return { accepted: true, replay: true };
    if (row.status !== 'draft') throw Error('mcp_submission_operation_pending');
    await assertImageSelection(row as SubmissionRecord, tx);
    const approval = { uid, quoteId, contentHash: row.contentHash, editorialDecision: quote.editorialDecision,
      executionPolicy: row.executionPolicy || 'legacy-preparation', ceilingDkkMicros: quote.ceilingDkkMicros, acceptedAt: new Date().toISOString() };
    tx.create(ref.collection('approvals').doc(quoteId), { ...approval, quote });
    tx.update(ref, { approval, packageReservedDkkMicros: 0, status: 'processing', nextStep: 'media', updatedAt: approval.acceptedAt });
    return { accepted: true, replay: false };
  });
}
