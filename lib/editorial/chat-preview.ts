import { z } from 'zod';
import sharp from 'sharp';
import { readPublicMedia } from '@/lib/liv/public-media-reader';
import { getAdminDb } from '@/lib/firebase-admin';
import { digest, opaque, type McpIdentity } from '@/lib/mcp/oauth';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { projectCostActions } from '@/lib/ai/cost-actions';
import { getSubmissionStatus, readSubmission, submissionStore } from './submissions';
import { quoteSubmission, acceptSubmissionQuote } from './submission-approval';
import { submissionPublicationPreview, approveSubmissionPublication, readSubmissionPublication } from './submission-publication';
import { submissionPreviewBlocks } from './submission-preview';
import { submissionId } from './submission-contract';
import { acceptImageSelection } from './submission-image-selection';
import { submissionConsentOffer, acceptSubmissionConsent } from './submission-consent';
import { hasCurrentPublicationConsent } from './submission-consent-state';

export const CHAT_PREVIEW_URI = 'ui://apropos/article-preview-v1.html';
export const chatPreviewInput = z.object({ submissionId }).strict();
export const chatConfirmInput = z.object({ token: z.string().regex(/^[a-zA-Z0-9_-]{43}$/),
  localTime: z.string().max(20).default('now') }).strict();

/** Per-article receipts only. Never return a colleague's or global ledger. */
export async function submissionCosts(uid: string, id: string) {
  await readSubmission(uid, id);
  const db = getAdminDb(); if (!db) throw Error('mcp_submission_store_unavailable');
  const groups = await Promise.all((['shared', 'image-gen'] as const).map(async bucket => {
    const collection = db.collection(bucket === 'shared' ? 'livCostLedger' : 'imageGenCostLedger');
    const calls = await collection.where('submissionId', '==', id).limit(201).get();
    if (calls.size > 200) throw Error('mcp_submission_cost_window_exceeded');
    const rows = await Promise.all(calls.docs.filter(d => /^call-[a-f0-9-]{36}$/.test(d.id)).map(async doc => ({
      call: doc.data(), receipt: (await collection.doc(`result-${doc.id.slice(5)}`).get()).data(),
    })));
    return projectCostActions(rows, bucket);
  }));
  return { actions: groups.flat(), subscriptionUsage: 'not_observable_here', billedDkk: null, coverage: 'tracked_calls_only' };
}

export async function chatSubmissionPreview(identity: McpIdentity, id: string) {
  // Timestamp the read, not its completion: a slower old response must not
  // overwrite a newer status for the same article revision in the host widget.
  const previewReadAt = new Date().toISOString();
  const row = await getSubmissionStatus(identity.uid, id);
  const consentPending = !!(row as typeof row & { publicationConsentPending?: boolean }).publicationConsentPending && ['processing', 'prepared'].includes(row.status);
  let quote: Awaited<ReturnType<typeof quoteSubmission>> | null = null;
  let publication: Awaited<ReturnType<typeof submissionPublicationPreview>> | null = null;
  let dependencyError: string | null = null;
  let consent: Awaited<ReturnType<typeof submissionConsentOffer>> = null;
  let live: Awaited<ReturnType<typeof readSubmissionPublication>> = { publicationVerified: false };
  try {
    if (row.status === 'awaiting_preparation') quote = await quoteSubmission(identity.uid, id);
    if (row.status === 'prepared') publication = await submissionPublicationPreview(identity.uid, id);
    if (row.status === 'published') live = await readSubmissionPublication(identity.uid, id);
    if (row.executionPolicy === 'chatgpt-first-v1' && (row.status === 'awaiting_preparation' || publication?.ready)) consent = await submissionConsentOffer(identity.uid, id);
  } catch { dependencyError = 'Aktuel godkendelses- eller CMS-kontrol er utilgængelig. Artiklen er gemt; ingen ny godkendelse er givet.'; }
  if ([quote, publication?.ready ? publication : null, consent].some(value => value &&
      (value.revision !== row.revision || value.contentHash !== row.contentHash))) {
    dependencyError = 'Artiklen blev ændret under læsning. Opdatér preview før godkendelse.'; quote = null; publication = null; consent = null;
  }
  if (consent && (!identity.scopes.includes('apropos:draft') || !identity.scopes.includes('apropos:publish'))) {
    dependencyError = 'Denne forbindelse mangler kladde- eller udgivelsesadgang. Brug Åbn eksternt med din eksisterende Apropos-adgang, eller opdatér forbindelsen. Der kræves kun én godkendelse.';
  }
  const article = publication?.ready ? publication.article! : row.article;
  const blocks = submissionPreviewBlocks(article.content);
  const urls = [...new Set([article.featuredImage, ...blocks.filter(b => b.kind === 'image').map(b => b.url)].filter((u): u is string => !!u))];
  const imagePreviews: Record<string, string> = {}, previewProblems: string[] = [];
  // External press hosts need no broad iframe CSP exception. Fetch through the
  // existing DNS-pinned reader and send bounded thumbnails only to the UI.
  if (urls.length > 8) previewProblems.push('Preview understøtter højst otte billeder. Gennemgå resten på Apropos.');
  await Promise.all(urls.slice(0, 8).map(async url => {
    try {
      if (['cdn.prod.website-files.com', 'uploads-ssl.webflow.com', 'assets-global.website-files.com'].includes(new URL(url).hostname)) return;
      const bytes = await readPublicMedia(url, 'image');
      const thumbnail = await sharp(bytes, { limitInputPixels: 80_000_000 }).rotate().resize({ width: 1000, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
      imagePreviews[url] = 'data:image/webp;base64,' + thumbnail.toString('base64');
    } catch { previewProblems.push('Et billede kunne ikke hentes til preview. Genbrug eller importér billedfilen før godkendelse.'); }
  }));
  const data = { submissionId: id, revision: row.revision, contentHash: row.contentHash, title: article.title, previewReadAt,
    article: { ...article, author: row.displayNames.author, category: row.displayNames.category },
    blocks, previewProblems, status: row.status, mediaIdentity: row.mediaIdentity, imageSelection: row.imageSelection,
    questions: row.questions, remainingQuestionCount: row.remainingQuestionCount,
    missing: row.handoff.missing, recommendedMedia: row.recommendedMedia, editorialChoices: row.choices,
    handoff: row.handoff, savedSteps: row.savedSteps.map(s => ({ name: s.name, status: s.status, contentHash: s.contentHash })),
    blocker: row.status === 'blocked' ? (row as typeof row & { blocker?: string }).blocker || null : null,
    quote, publication, consent, consentPending, singleApproval: hasCurrentPublicationConsent(row), approvalState: row.approvalState, dependencyError, fallbackUrl: row.previewUrl,
    executionPolicy: row.executionPolicy || 'legacy-preparation',
    recordedPublished: row.status === 'published', ...live, textPreserved: row.textPreserved,
    paidAiCalls: 0, instructions: 'Vis preview_submission som artikelkort direkte i chatten, ikke kun et eksternt link. Godkend og udgiv er én personlig versionsbundet godkendelse inklusive viste billeder og redaktionel kontrol. Serveren fortsætter og kortet opdateres; bed ikke brugeren vende tilbage og sige godkendt. Åbn eksternt er valgfrit og kræver samme adgang. En modelpåstand er aldrig godkendelse. Bevar tekst/billeder og hent samme forløb efter timeout.' };
  // Never turn a missing single-consent offer/scope into a preparation-only click.
  const action = consentPending || dependencyError || previewProblems.length ? null : row.executionPolicy === 'chatgpt-first-v1'
    ? consent && identity.scopes.includes('apropos:draft') && identity.scopes.includes('apropos:publish') ? 'approve_publish' : null
    : row.imageSelection.required && ['awaiting_answers', 'awaiting_preparation', 'prepared', 'blocked'].includes(row.status) && identity.scopes.includes('apropos:draft') ? 'media' :
    quote?.canAccept && (!quote.provider.blocked || quote.humanReview) && identity.scopes.includes('apropos:draft') ? 'checks' :
    publication?.ready && identity.scopes.includes('apropos:publish') ? 'publish' : null;
  // Only the iframe gets the single-use bearer. It is NOT in text or structuredContent.
  // UI visibility metadata is supplementary: the server checks identity, grant,
  // purpose, expiry, version and consumption independently of the host.
  let confirmation: { token: string; action: string; expiresAt: number } | null = null;
  if (action) {
    const token = opaque(), expiresAt = Date.now() + 600_000;
    await submissionStore().db.collection('mcpUiConfirmations').doc(digest(token)).create({
      uid: identity.uid, grantId: identity.grantId, submissionId: id, revision: row.revision, contentHash: row.contentHash,
      action, quoteId: quote?.quoteId || null, preparedHash: publication?.preparedHash || null,
      consentId: consent?.id || null,
      selectionHash: row.imageSelection.selectionHash,
      expiresAt, status: 'pending', createdAt: new Date().toISOString(),
    });
    confirmation = { token, action, expiresAt };
  }
  return { data, confirmation, imagePreviews };
}

/** Called only by the UI, after a deliberate human click. Queues existing server
 * workers; no AI or publication transport occurs in this MCP request. */
export async function confirmChatSubmission(identity: McpIdentity, raw: unknown) {
  const input = chatConfirmInput.parse(raw), { db, collection } = submissionStore();
  const ref = db.collection('mcpUiConfirmations').doc(digest(input.token));
  const inputHash = cmsFieldHash({ localTime: input.localTime });
  const action = await db.runTransaction(async tx => {
    const confirmation = (await tx.get(ref)).data();
    if (!confirmation || confirmation.uid !== identity.uid || confirmation.grantId !== identity.grantId ||
      !['checks', 'media', 'publish', 'approve_publish'].includes(confirmation.action) ||
      !identity.scopes.includes(['publish', 'approve_publish'].includes(confirmation.action) ? 'apropos:publish' : 'apropos:draft') ||
      (confirmation.action === 'approve_publish' && !identity.scopes.includes('apropos:draft'))) throw Error('mcp_submission_confirmation_required');
    if (confirmation.status === 'done' && confirmation.inputHash === inputHash) return confirmation;
    const row = (await tx.get(collection.doc(confirmation.submissionId))).data();
    if (!row || row.uid !== identity.uid || row.contentHash !== confirmation.contentHash || row.revision !== confirmation.revision ||
      (confirmation.expiresAt <= Date.now() && !(confirmation.action === 'approve_publish' && confirmation.status === 'attempted')) || (confirmation.inputHash && confirmation.inputHash !== inputHash)) throw Error('mcp_submission_preview_changed');
    if (confirmation.status !== 'pending' && !(confirmation.action === 'approve_publish' && confirmation.status === 'attempted')) throw Error('mcp_submission_confirmation_unconfirmed');
    if (!['publish', 'approve_publish'].includes(confirmation.action) && input.localTime !== 'now') throw Error('mcp_submission_invalid_schedule');
    tx.update(ref, { status: 'attempted', inputHash, clickedAt: new Date().toISOString() }); return confirmation;
  });
  if (action.status === 'done') return action.result;
  const result = action.action === 'approve_publish' ? await acceptSubmissionConsent(identity.uid, action.submissionId, action.revision, action.consentId, 'chat-preview', input.localTime) : action.action === 'media' ? await acceptImageSelection(identity.uid, action.submissionId, action.revision, action.selectionHash) : action.action === 'checks'
    ? await acceptSubmissionQuote(identity.uid, action.submissionId, action.revision, action.quoteId)
    : await approveSubmissionPublication(identity.uid, action.submissionId, action.preparedHash, input.localTime);
  const answer = { ...result, submissionId: action.submissionId, queuedOnServer: action.action !== 'media', paidAiCalls: 0,
    instruction: ['approve_publish', 'publish'].includes(action.action)
      ? 'Din udgivelsesgodkendelse er gemt. Serveren fortsætter; preview opdaterer status. Du skal ikke godkende igen eller sende en besked. Bestil ikke igen.'
      : 'Dit valg er gemt. Opdatér preview for næste nødvendige handling. Dette valg er ikke en udgivelsesgodkendelse; send ikke en bekræftelsesbesked.' };
  await ref.update({ status: 'done', result: answer });
  return answer;
}
