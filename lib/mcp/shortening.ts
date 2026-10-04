import { z } from 'zod';
import { load } from 'cheerio';
import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash as hash } from '@/lib/liv/cms-field-hash';
import { shorteningProposalInput, shorteningEdits } from '@/lib/liv/shortening-contract';
import { readLivShorteningBaseline } from '@/lib/liv/shortening-baseline';
import { readLivShorteningCheckpoint } from '@/lib/liv/shortening-checkpoint';
import { readLivShorteningRecord } from '@/lib/liv/shortening-record';
import { buildLivShorteningCandidate } from '@/lib/liv/shortening-candidate';
import { livEditableParagraphs } from '@/lib/liv/paragraph-edits';
import { recordLivShorteningReview } from '@/lib/liv/shortening-review';
import { acceptLivShortening } from '@/lib/liv/accept-shortening';
import { MCP_ORIGIN } from './config';

export const externalShorteningInput = shorteningProposalInput.extend(shorteningEdits.shape).strict();
export const shorteningIdInput = z.object({ proposalId: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const shorteningApplyInput = shorteningIdInput.extend({ candidateHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const shorteningConfirmationInput = shorteningApplyInput.extend({ reviewedFactsAndMeaning: z.literal(true) }).strict();
const database = () => { const db = getAdminDb(); if (!db) throw Error('mcp_unavailable'); return db; };
const owner = (uid: string) => { if (!uid || uid.length > 128) throw Error('mcp_owner_required'); };

/** Uses the same ready-entry/checkpoint rules as the first-party shortening
 * tool. Arbitrary imported CMS drafts and failed generations are not admitted. */
export async function getShorteningContext(itemId: string) {
  const baseline = await readLivShorteningBaseline(itemId);
  const article = await readLivShorteningCheckpoint(itemId, baseline.expectedPayloadHash);
  return { ...baseline, title: article.title, intro: article.intro,
    paragraphs: livEditableParagraphs(article.content).map(({ index, before, editable }) => ({ index, before, editable })),
    paidAiCalls: 0, untrustedContent: true, instruction: 'Forkort kun editable-afsnit med præcis before/after. Bevar fakta, betydning, billeder, links, citater og metadata. Forslaget skal læses og bekræftes af Frederik før CMS-gemning.' };
}

const link = (id: string) => `${MCP_ORIGIN}/connect/chatgpt?shortening=${id}`;
async function readOwned(uid: string, id: string) {
  owner(uid); shorteningIdInput.parse({ proposalId: id });
  const row = (await database().collection('livShorteningProposals').doc(id).get()).data();
  if (row?.candidateSource?.kind !== 'chatgpt-supplied' || row.candidateSource.actorUid !== uid)
    throw Error('mcp_shortening_not_found');
  const saved = readLivShorteningRecord(row, uid);
  if (hash({ itemId: saved.input.itemId, requestId: saved.input.requestId }) !== id) throw Error('mcp_revision_conflict');
  return { row, ...saved };
}
const reviewInput = (saved: Awaited<ReturnType<typeof readOwned>>) => ({ ...saved.input,
  candidateHash: saved.candidateHash, reviewedFactsAndMeaning: true as const });

/** Immutable external proposal, not a fabricated provider result or approval.
 * A repeated request reuses the saved proposal even after the article changes. */
export async function previewExternalShortening(uid: string, value: unknown) {
  owner(uid); const { bodyEdits, ...input } = externalShorteningInput.parse(value);
  const edits = { bodyEdits }, submissionHash = hash({ input, edits, actorUid: uid });
  const proposalId = hash({ itemId: input.itemId, requestId: input.requestId });
  const db = database(), ref = db.collection('livShorteningProposals').doc(proposalId);
  const previous = (await ref.get()).data();
  if (previous) {
    if (previous.submissionHash !== submissionHash) throw Error('mcp_shortening_request_conflict');
    const saved = await readOwned(uid, proposalId);
    return { ...saved.candidate, proposalId, candidateHash: saved.candidateHash,
      confirmationUrl: link(proposalId), paidAiCalls: 0, source: 'chatgpt-supplied', replayed: true };
  }
  const baseline = await readLivShorteningBaseline(input.itemId);
  if (baseline.expectedCmsHash !== input.expectedCmsHash || baseline.expectedPayloadHash !== input.expectedPayloadHash)
    throw Error('liv_shortening_version_changed');
  const article = await readLivShorteningCheckpoint(input.itemId, input.expectedPayloadHash);
  if (JSON.stringify(article).length > 200_000) throw Error('liv_shortening_candidate_invalid');
  const candidate = buildLivShorteningCandidate(article, input.targetWords, edits);
  const proposal = { ...candidate, proposalId, ...input, candidateHash: hash({ content: candidate.content }), status: 'preview' };
  await db.runTransaction(async tx => {
    const latest = (await tx.get(ref)).data();
    if (latest) {
      if (latest.submissionHash !== submissionHash) throw Error('mcp_shortening_request_conflict');
      readLivShorteningRecord(latest, uid); return;
    }
    tx.create(ref, { input, inputHash: hash({ input, article }), article, edits, submissionHash, proposal,
      status: 'preview', candidateSource: { kind: 'chatgpt-supplied', actorUid: uid, modelVerified: false },
      providerAttempted: false, createdAt: new Date().toISOString() });
  });
  return { ...candidate, proposalId, candidateHash: proposal.candidateHash, confirmationUrl: link(proposalId),
    source: 'chatgpt-supplied', paidAiCalls: 0, replayed: false };
}

function paragraphs(html: string) {
  const $ = load(html); $('script,style,iframe,template').remove();
  return $('p,h2,h3,figcaption,blockquote').filter((_, node) => !$(node).parents('p,blockquote').length)
    .map((_, node) => $(node).text()).get();
}
export async function getExternalShortening(uid: string, id: string) {
  const saved = await readOwned(uid, id), input = reviewInput(saved), identityHash = hash({ input, actorUid: uid });
  const [review, acceptance] = await Promise.all([
    database().collection('livShorteningReviews').doc(id).get(), database().collection('livShorteningAcceptances').doc(id).get(),
  ]);
  const reviewRow = review.data(), acceptanceRow = acceptance.data();
  if ((reviewRow && (reviewRow.identityHash !== identityHash || reviewRow.kind !== 'explicit-human-review' ||
    reviewRow.modelVerified !== false || reviewRow.actorUid !== uid || hash(reviewRow.input || {}) !== hash(input) ||
    reviewRow.originalInputHash !== saved.row.inputHash || reviewRow.receipt?.candidateHash !== saved.candidateHash)) ||
    (acceptanceRow && acceptanceRow.identityHash !== identityHash)) throw Error('mcp_shortening_review_conflict');
  const receipt = acceptanceRow?.receipt;
  if (receipt && (receipt.status !== 'shortening_staged' || receipt.itemId !== input.itemId ||
    receipt.revisionId !== id || receipt.candidateHash !== saved.candidateHash || receipt.publicationVerified !== false)) throw Error('mcp_shortening_receipt_conflict');
  let currentVersionMatches = false;
  try {
    const baseline = await readLivShorteningBaseline(input.itemId);
    currentVersionMatches = baseline.expectedCmsHash === input.expectedCmsHash && baseline.expectedPayloadHash === input.expectedPayloadHash;
  } catch { /* A failed read or changed/selected article never authorizes review. */ }
  return { proposalId: id, itemId: input.itemId, title: saved.article.title, intro: saved.article.intro,
    ...saved.candidate, candidateHash: saved.candidateHash, confirmationUrl: link(id),
    originalParagraphs: paragraphs(saved.article.content), proposedParagraphs: paragraphs(saved.candidate.content),
    changes: saved.edits.bodyEdits, currentVersionMatches, reviewed: !!reviewRow,
    status: receipt ? 'staged' : acceptanceRow ? 'save_unconfirmed' : reviewRow ? 'reviewed' : 'awaiting_review',
    // Receipt is historical save evidence, not fresh public readback.
    receipt: receipt || null, publicationVerified: false, paidAiCalls: 0, untrustedContent: true,
    source: 'chatgpt-supplied', action: 'Godkendelsen skal ske på dit personlige link. Gemning bruger apply_shortening med samme proposalId og candidateHash. Publicering kræver sit eget friske preview og godkendelse.' };
}

/** First-party owner authentication only. Not registered as an MCP tool. */
export async function confirmExternalShortening(uid: string, value: unknown) {
  const input = shorteningConfirmationInput.parse(value);
  const saved = await readOwned(uid, input.proposalId);
  if (saved.candidateHash !== input.candidateHash) throw Error('mcp_revision_conflict');
  return recordLivShorteningReview(reviewInput(saved), uid);
}
export async function applyExternalShortening(uid: string, value: unknown) {
  const input = shorteningApplyInput.parse(value), saved = await readOwned(uid, input.proposalId);
  if (saved.candidateHash !== input.candidateHash) throw Error('mcp_revision_conflict');
  // This existing service independently requires the actual owner's saved
  // review, current baseline, write lease, exact patch and full CMS readback.
  return acceptLivShortening(reviewInput(saved), uid);
}
