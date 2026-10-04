import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { readDeliveryState, readDeliveryPayload } from '@/lib/liv/delivery-store';
import { copenhagenClock, eligibleEntries } from '@/lib/liv/delivery-policy';
import { inspectLivCmsDraft } from '@/lib/liv/cms-readback';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { deliverReadyArticle } from '@/lib/liv/deliver-ready';
import { verifyLiveLivArticle } from '@/lib/liv/publish-verified';
import { MCP_ORIGIN } from './config';
import { articleImages } from './markup';
const store = () => { const db = getAdminDb(); if (!db) throw Error('mcp_unavailable'); return db.collection('mcpPublications'); };
export function assertPublicationEnabled() {
  if (process.env.LIV_DELIVERY_QUEUE_ENABLED !== 'true' || process.env.LIV_DAILY_PUBLICATION_MODE !== 'auto_publish' ||
    /^(1|true)$/i.test(process.env.LIV_DAILY_PAUSED || '')) throw Error('mcp_publication_disabled');
}
export async function publicationState(itemId: string) {
  assertPublicationEnabled();
  const day = copenhagenClock().day, state = await readDeliveryState();
  const entry = eligibleEntries(state, day).find(e => e.itemId === itemId);
  if (!entry || state.coverRevision || (state.slots[day] && state.slots[day].itemId !== itemId)) {
    return { ready: false as const, blockers: ['Artiklen er ikke en godkendt, aktuel Liv-udgivelse. En Webflow-kladde alene er ikke publiceringsklar.'], day };
  }
  const expected = await readDeliveryPayload(itemId);
  if (cmsFieldHash({ ...expected }) !== entry.payloadHash) throw Error('mcp_revision_conflict');
  const check = await inspectLivCmsDraft({ itemId, expected });
  return { ready: check.publicationReady && check.draftConfirmed && check.checks.length > 0 && check.checks.every(c => c.ok),
    blockers: check.checks.filter(c => !c.ok).map(c => c.id), day, entry, expected, check, bodyImages: articleImages(expected.content) };
}
export async function previewPublication(uid: string, itemId: string) {
  const state = await publicationState(itemId);
  if (!state.ready || !('entry' in state)) return state;
  const id = randomUUID();
  await store().doc(id).create({ uid, itemId, day: state.day, payloadHash: state.entry.payloadHash,
    cmsHash: state.check.fieldDataHash, expiresAt: Date.now() + 600000, approved: false, attempted: false,
    title: state.expected.title, slug: state.expected.slug, createdAt: new Date().toISOString() });
  return { ready: true, previewId: id, title: state.expected.title, expectedPayloadHash: state.entry.payloadHash,
    cover: state.expected.featuredImage, content: state.expected.content, checks: state.check.checks,
    confirmationUrl: `${MCP_ORIGIN}/connect/chatgpt?publication=${id}`, estimatedAiCostDkk: 0,
    instruction: 'Bed Frederik åbne linket og bekræfte denne version. Kald derefter publish_article med samme previewId. Ingen publikation er startet.' };
}
export async function readPublication(uid: string, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Error('mcp_invalid_preview');
  const row = (await store().doc(id).get()).data();
  if (!row || row.uid !== uid) throw Error('mcp_preview_not_found');
  return row;
}

/** Read an existing owner operation without re-publishing, even after midnight,
 * preview expiry or a publication pause. Historical receipts stay historical;
 * only the normal exact CMS + public-page readback certifies current visibility.
 * No queue/preview mutation: server recovery still owns delivery finalization.
 */
export async function getPublicationStatus(uid: string, id: string) {
  const row = await readPublication(uid, id);
  const base = { previewId: id, itemId: row.itemId as string, title: row.title as string, day: row.day as string,
    approved: row.approved === true, publishRequested: row.attempted === true,
    previewExpired: row.expiresAt < Date.now() || row.day !== copenhagenClock().day,
    readOnly: true as const, paidAiCalls: 0, publicationVerified: false, deliveryFinalized: false };
  if (!base.approved || !base.publishRequested) return { ...base,
    status: base.previewExpired ? 'preview_expired' : base.approved ? 'confirmed_not_started' : 'awaiting_confirmation',
    action: base.previewExpired ? 'Hent et nyt preview før en eventuel udgivelse. Ingen publikation er startet af denne læsning.'
      : 'Ingen publicering er bekræftet. Bevar previewId og brug den normale personlige bekræftelse før publish_article.' };

  const slot = (await readDeliveryState()).slots[row.day];
  const binding = slot?.explicitPublication;
  const matches = slot?.itemId === row.itemId && binding?.itemId === row.itemId &&
    binding.requestId === `mcp-${id}` && binding.expectedPayloadHash === row.payloadHash;
  if (!matches || (slot.state !== 'attempted' && slot.state !== 'published') ||
      !/^[a-f0-9]{64}$/.test(slot.fieldDataHash || '')) return { ...base,
    status: 'reconciliation_required', reason: 'matching_publication_intent_missing',
    action: 'Ingen entydig publiceringskvittering for denne version. Bevar identiteten og undersøg leveringsstatus; opret ikke et nyt publiceringsforsøg.' };

  const recordedPublication = slot.state === 'published' && slot.publicUrl && slot.checkedAt
    ? { publicUrl: slot.publicUrl, checkedAt: slot.checkedAt, source: 'delivery_receipt' as const } : null;
  const known = { ...base, deliveryFinalized: slot.state === 'published', recordedPublication };
  try {
    const expected = await readDeliveryPayload(row.itemId);
    if (cmsFieldHash({ ...expected }) !== row.payloadHash) return { ...known,
      status: 'reconciliation_required', reason: 'payload_version_changed',
      action: 'Den gemte artikelversion matcher ikke publiceringsforsøget. Undersøg versionshistorikken; ingen felter er overskrevet.' };
    // fieldDataHash is the durable pre-publish snapshot, including any canonical
    // publication-date patch. The earlier preview CMS hash is not that snapshot.
    const receipt = await verifyLiveLivArticle({ itemId: row.itemId, expected, fieldDataHash: slot.fieldDataHash! });
    if (!receipt.publicationVerified || receipt.itemId !== row.itemId ||
        receipt.publicUrl !== `https://www.aproposmagazine.com/articles/${expected.slug}` ||
        !Number.isFinite(Date.parse(receipt.checkedAt))) throw Error('liv_publication_readback_mismatch');
    return { ...known, ...receipt, status: 'published', publicationOrigin: 'operator',
      action: slot.state === 'published' ? 'Denne artikelversion er verificeret i CMS og på den offentlige side. Publicér den ikke igen.'
        : 'Denne artikelversion er verificeret live. Serverens leveringskvittering mangler stadig afslutning; ingen ny publicering er nødvendig.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return { ...known, status: 'reconciliation_required', reason: 'live_readback_unconfirmed',
      detail: /^liv_[a-z0-9_]{1,100}$/.test(message) ? message : 'readback_failed',
      action: 'Den offentlige artikelversion kunne ikke bekræftes nu. En gemt kvittering er historik, ikke frisk readback. Bevar identiteten og kontrollér status igen; ingen ny publicering.' };
  }
}
async function assertUnchanged(row: Record<string, any>) {
  if (row.expiresAt < Date.now() || row.day !== copenhagenClock().day) throw Error('mcp_preview_expired');
  const fresh = await publicationState(row.itemId);
  if (!fresh.ready || !('entry' in fresh) || fresh.entry.payloadHash !== row.payloadHash || fresh.check.fieldDataHash !== row.cmsHash) {
    throw Error('mcp_revision_conflict');
  }
  return fresh;
}
/** Only the authenticated first-party confirmation UI calls this, never an MCP tool. */
export async function approvePublication(uid: string, id: string) {
  const row = await readPublication(uid, id); await assertUnchanged(row);
  await store().doc(id).update({ approved: true, approvedAt: new Date().toISOString() });
  return { approved: true, publicationStarted: false };
}
export async function executePublication(uid: string, id: string) {
  const row = await readPublication(uid, id);
  if (!row.approved) throw Error('mcp_human_confirmation_required');
  // An attempted old-day operation can only be observed, never dispatched on a
  // new day. Read-only reconciliation remains available while publication is off.
  if (row.attempted && row.day !== copenhagenClock().day) return getPublicationStatus(uid, id);
  assertPublicationEnabled();
  if (row.result?.status === 'published' && row.result.publicationVerified) return row.result;
  // Retries of an attempted request use the SAME durable delivery receipt. No new identity.
  if (!row.attempted) { await assertUnchanged(row); await store().doc(id).update({ attempted: true }); }
  if (row.day !== copenhagenClock().day) throw Error('mcp_publication_reconciliation_required');
  let result: Record<string, unknown> = await deliverReadyArticle(new Date(), undefined, { itemId: row.itemId,
    expectedPayloadHash: row.payloadHash, requestId: `mcp-${id}`, reason: `Frederik bekræftede artikelversionen via Apropos. MCP preview ${id}` });
  // A busy/already-complete day can return only a status. Never present that as
  // this article's publication proof; require its durable receipt and identity.
  if (result.status === 'published' && !result.publicationVerified) {
    const slot = (await readDeliveryState()).slots[row.day];
    if (slot?.state === 'published' && slot.itemId === row.itemId && slot.publicUrl && slot.checkedAt &&
        slot.explicitPublication?.requestId === `mcp-${id}`) {
      result = { status: 'published', day: row.day, itemId: row.itemId, publicUrl: slot.publicUrl,
        checkedAt: slot.checkedAt, publicationVerified: true, replay: true };
    } else result = { status: 'reconciliation_required', itemId: row.itemId, publicationVerified: false };
  }
  await store().doc(id).update({ result: JSON.parse(JSON.stringify(result)), checkedAt: new Date().toISOString() });
  return result;
}
