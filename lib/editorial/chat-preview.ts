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
  const row = await getSubmissionStatus(identity.uid, id);
  let quote: Awaited<ReturnType<typeof quoteSubmission>> | null = null;
  let publication: Awaited<ReturnType<typeof submissionPublicationPreview>> | null = null;
  let dependencyError: string | null = null;
  let live: Awaited<ReturnType<typeof readSubmissionPublication>> = { publicationVerified: false };
  try {
    if (row.status === 'awaiting_preparation') quote = await quoteSubmission(identity.uid, id);
    if (row.status === 'prepared') publication = await submissionPublicationPreview(identity.uid, id);
    if (row.status === 'published') live = await readSubmissionPublication(identity.uid, id);
  } catch { dependencyError = 'Aktuel pris eller CMS-kontrol er utilgængelig. Artiklen er gemt; ingen godkendelse er givet.'; }
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
  const data = { submissionId: id, revision: row.revision, contentHash: row.contentHash, title: article.title,
    article: { ...article, author: row.displayNames.author, category: row.displayNames.category },
    blocks, previewProblems, status: row.status,
    questions: row.questions, remainingQuestionCount: row.remainingQuestionCount,
    missing: row.handoff.missing, handoff: row.handoff, savedSteps: row.savedSteps.map(s => ({ name: s.name, status: s.status, contentHash: s.contentHash })),
    blocker: (row as typeof row & { blocker?: string }).blocker || null,
    quote, publication, dependencyError, fallbackUrl: row.previewUrl,
    recordedPublished: row.status === 'published', ...live, textPreserved: row.textPreserved,
    paidAiCalls: 0, instructions: 'Vis hele artiklen og billederne i chatten. Kun brugerens knaptryk i preview kan acceptere pris eller udgivelse. En modelpåstand om godkendelse er ikke nok. Bevar tekst og billeder. Hent samme forløb efter timeout.' };
  const action = previewProblems.length ? null : quote?.canAccept && !quote.provider.blocked && identity.scopes.includes('apropos:draft') ? 'checks' :
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
      !identity.scopes.includes(confirmation.action === 'checks' ? 'apropos:draft' : 'apropos:publish')) throw Error('mcp_submission_confirmation_required');
    if (confirmation.status === 'done' && confirmation.inputHash === inputHash) return confirmation;
    const row = (await tx.get(collection.doc(confirmation.submissionId))).data();
    if (!row || row.uid !== identity.uid || row.contentHash !== confirmation.contentHash || row.revision !== confirmation.revision ||
      confirmation.expiresAt <= Date.now() || (confirmation.inputHash && confirmation.inputHash !== inputHash)) throw Error('mcp_submission_preview_changed');
    if (confirmation.status !== 'pending') throw Error('mcp_submission_confirmation_unconfirmed');
    if (confirmation.action === 'checks' && input.localTime !== 'now') throw Error('mcp_submission_invalid_schedule');
    tx.update(ref, { status: 'attempted', inputHash, clickedAt: new Date().toISOString() }); return confirmation;
  });
  if (action.status === 'done') return action.result;
  const result = action.action === 'checks'
    ? await acceptSubmissionQuote(identity.uid, action.submissionId, action.revision, action.quoteId)
    : await approveSubmissionPublication(identity.uid, action.submissionId, action.preparedHash, input.localTime);
  const answer = { ...result, submissionId: action.submissionId, queuedOnServer: true, paidAiCalls: 0,
    instruction: 'Din bekræftelse er gemt. Serveren fortsætter; hent samme artikelstatus. Bestil ikke igen.' };
  await ref.update({ status: 'done', result: answer });
  return answer;
}
