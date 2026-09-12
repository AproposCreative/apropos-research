import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { load } from 'cheerio';
import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from './cms-field-hash';
import { livImageArticleHash } from './article-image-hash';
import { readLivWebflowJson, inspectLivCmsDraft } from './cms-readback';
import { patchArticleFieldDataForLocale } from '@/lib/webflow/locale-items';
import { acquireCmsWriteLease } from '@/lib/seo-engine/cms-write-lease';
import { cmsLocaleIdFor } from '@/lib/seo-engine/opportunity-engine/locale';
import { getWebflowConfig } from '@/lib/webflow-config';
import { env } from '@/lib/config/env';
import type { DeliveryState } from './delivery-policy';
import type { GeneratedArticle } from './generate-article';
import type { PreparationProof } from './prepared-admission';
import type { WebflowArticleFields } from '@/lib/webflow/types';

const text = (max: number) => z.string().trim().min(10).max(max).refine(v => !/[<>\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(v));
export const presentationRevisionInput = z.object({
  itemId: z.string().regex(/^[a-f0-9]{24}$/), requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  expectedCmsHash: z.string().regex(/^[a-f0-9]{64}$/), expectedPayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: text(1000), patch: z.object({ title: text(160).optional(), seoTitle: text(100), seoDescription: text(320) }).strict(),
}).strict();
type Input = z.infer<typeof presentationRevisionInput>;
type Row = Record<string, unknown> & { articleCheckpoint?: GeneratedArticle; preparationProof?: PreparationProof };
const hash = (x: object) => cmsFieldHash(x as Record<string, unknown>);
const fail = (code: string): never => { throw new Error(`liv_presentation_${code}`); };
/** CMS image optimization legitimately rewrites delivery URLs/dimensions.
 * Compare all prose, captions, alt text, order and other markup; the existing
 * full CMS inspection separately verifies the saved derivative image bytes. */
export function samePresentationBody(checkpoint: string, payload: string) {
  const canonical = (html: string) => {
    const $ = load(html);
    $('img').each((_, element) => {
      for (const key of ['src', 'srcset', 'width', 'height', 'style']) $(element).removeAttr(key);
      if ('attribs' in element) element.attribs = Object.fromEntries(Object.entries(element.attribs).sort(([a], [b]) => a.localeCompare(b)));
    });
    return $('body').html();
  };
  return canonical(checkpoint) === canonical(payload);
}
export function presentationFields(before: Record<string, unknown>, patch: Input['patch']) {
  return { ...before, ...(patch.title ? { name: patch.title } : {}), 'seo-title': patch.seoTitle, 'meta-description': patch.seoDescription };
}
export function presentationCheckpoint(before: GeneratedArticle, patch: Input['patch']) {
  const article = { ...before, ...patch };
  // The immutable revision audit preserves the original image/context binding.
  // No image bytes, source, provider response or original quality result changes.
  if (article.selectedImage) article.selectedImage = { ...article.selectedImage, articleHash: livImageArticleHash(article) };
  return article;
}

/** Explicit operator copyedit of a ready, never-published draft. Not an AI gate
 * override: records human editorial responsibility and preserves all original checks. */
export async function reviseLivPresentation(value: unknown) {
  const parsed = presentationRevisionInput.safeParse(value);
  if (!parsed.success) return fail('invalid');
  const input = parsed.data, db = getAdminDb();
  if (!db) return fail('store_unavailable');
  const locale = cmsLocaleIdFor('da'), collection = getWebflowConfig().articlesCollectionId || env.WEBFLOW_ARTICLES_COLLECTION_ID;
  if (!locale || !collection) return fail('configuration');
  const id = hash({ itemId: input.itemId, requestId: input.requestId }), inputHash = hash(input), owner = randomUUID();
  const revisionRef = db.collection('livPresentationRevisions').doc(id);
  const auditRef = db.collection('livPresentationAudits').doc(id);
  const manifestRef = db.collection('livDelivery').doc('manifest');
  const payloadRef = db.collection('livDelivery').doc(`item-${input.itemId}`);
  const path = `collections/${collection}/items/${input.itemId}?cmsLocaleId=${locale}`;
  const lease = await acquireCmsWriteLease(input.itemId, 'da');
  try {
    const previous = (await revisionRef.get()).data();
    if (previous?.inputHash !== undefined && previous.inputHash !== inputHash) return fail('request_conflict');
    if (previous?.receipt) return previous.receipt;
    const cms = await readLivWebflowJson(path);
    if (cms.id !== input.itemId || cms.cmsLocaleId !== locale || cms.isDraft !== true || cms.isArchived || cms.lastPublished != null) return fail('not_unpublished_draft');
    const fields = cms.fieldData as Record<string, unknown>;
    const baseline = await db.runTransaction(async tx => {
      const latest = (await tx.get(revisionRef)).data();
      const state = (await tx.get(manifestRef)).data() as DeliveryState;
      const payload = (await tx.get(payloadRef)).data() as { expected: WebflowArticleFields; payloadHash: string };
      const runDocs = await tx.get(db.collection('livDailyArticles').where('webflowItemId', '==', input.itemId).limit(10));
      const rows = runDocs.docs.map(d => ({ id: d.id, row: d.data() as Row }));
      const audit = (await tx.get(auditRef)).data();
      const entry = state?.entries.find(e => e.itemId === input.itemId);
      if (!entry || entry.state !== 'ready' || entry.decision === 'rejected' ||
        Object.values(state.slots).some(s => s.itemId === input.itemId) ||
        (state.preparation && state.preparation.leaseUntil > Date.now())) return fail('not_ready');
      if (latest?.receipt) return { completed: latest.receipt };
      if (latest && (latest.inputHash !== inputHash || latest.leaseUntil > Date.now())) return fail('busy');
      if (state.coverRevision && state.coverRevision.id !== id) return fail('busy');
      if (!payload?.expected || payload.payloadHash !== input.expectedPayloadHash || hash(payload.expected) !== input.expectedPayloadHash ||
        entry.payloadHash !== input.expectedPayloadHash) return fail('payload_changed');
      if (!latest) {
        if (hash(fields) !== input.expectedCmsHash || fields.name !== payload.expected.title || fields.slug !== payload.expected.slug ||
          !rows.length || rows.length >= 10 || rows.some(r => r.row.status !== 'draft' || !r.row.articleCheckpoint || !r.row.preparationProof ||
            r.row.preparationProof.editorialPassed !== true || r.row.preparationProof.structurePassed !== true ||
            r.row.preparationProof.hash !== input.expectedPayloadHash || hash(r.row.preparationProof.expected) !== input.expectedPayloadHash ||
            !samePresentationBody(r.row.articleCheckpoint.content, payload.expected.content))) return fail('checkpoint_changed');
        tx.create(auditRef, { input, cms, payload, rows, entry, createdAt: new Date().toISOString(),
          editorialReview: { kind: 'explicit-operator-copyedit', reason: input.reason, originalChecksPreserved: true } });
      } else if (!audit || hash(audit.input) !== inputHash || state.coverRevision?.id !== id) return fail('audit_invalid');
      state.coverRevision = { id, itemId: input.itemId, day: entry.scheduledDay };
      tx.set(manifestRef, state);
      tx.set(revisionRef, { ...latest, inputHash, owner, leaseUntil: Date.now() + 330000, status: 'processing' });
      return { audit: audit || { input, cms, payload, rows, entry }, patchStarted: !!latest?.patchStarted };
    });
    if (baseline.completed) return baseline.completed;
    const audit = baseline.audit!;
    const expected = { ...audit.payload.expected, ...input.patch } as WebflowArticleFields;
    const expectedFields = presentationFields(audit.cms.fieldData, input.patch);
    const save = async (patch: Record<string, unknown>) => db.runTransaction(async tx => {
      const latest = (await tx.get(revisionRef)).data();
      const state = (await tx.get(manifestRef)).data() as DeliveryState;
      if (latest?.owner !== owner || latest.leaseUntil <= Date.now() || state?.coverRevision?.id !== id) return fail('hold_lost');
      tx.set(revisionRef, { ...latest, ...patch });
    });
    if (!baseline.patchStarted) {
      const fresh = await readLivWebflowJson(path);
      if (fresh.isDraft !== true || fresh.lastPublished != null || hash(fresh.fieldData as object) !== input.expectedCmsHash) return fail('cms_changed');
      await lease.assertOwned();
      await save({ patchStarted: true });
      await patchArticleFieldDataForLocale(input.itemId, {
        ...(input.patch.title ? { name: input.patch.title } : {}),
        'seo-title': input.patch.seoTitle, 'meta-description': input.patch.seoDescription,
      }, locale);
    }
    const after = await readLivWebflowJson(path);
    if (after.isDraft !== true || after.lastPublished != null || hash(after.fieldData as object) !== hash(expectedFields)) return fail('readback_pending');
    const inspection = await inspectLivCmsDraft({ itemId: input.itemId, expected });
    // A scoped copyedit must not overwrite unrelated edits made in Webflow.
    // Compare the actual current full checks with the immutable pre-edit CMS
    // snapshot. Existing failures remain explicit publication blockers; this
    // operation never converts them into passes or approves publication.
    const baselineInspection = await inspectLivCmsDraft({ itemId: input.itemId, expected: audit.payload.expected }, {
      collectionId: collection, localeId: locale,
      read: async requested => requested === path ? audit.cms : readLivWebflowJson(requested),
    });
    await save({ inspection, baselineInspection });
    const priorFailures = new Set(baselineInspection.checks.filter(c => !c.ok).map(c => c.id));
    if (!inspection.draftConfirmed || !inspection.checks.length ||
      inspection.checks.some(c => !c.ok && !priorFailures.has(c.id)) ||
      inspection.checks.some(c => ['field:seo-title', 'field:meta-description'].includes(c.id) && !c.ok) ||
      inspection.fieldDataHash !== hash(expectedFields)) return fail('inspection_failed');
    await lease.assertOwned();
    const final = await readLivWebflowJson(path);
    if (final.isDraft !== true || final.lastPublished != null || hash(final.fieldData as object) !== hash(expectedFields)) return fail('cms_changed');
    const receipt = { status: 'presentation_staged', itemId: input.itemId, revisionId: id, title: expected.title,
      seoTitle: expected.seoTitle, seoDescription: expected.seoDescription, payloadHash: hash(expected),
      fieldDataHash: inspection.fieldDataHash, publicationVerified: false, publicationReady: inspection.publicationReady,
      publicationBlockers: inspection.checks.filter(c => !c.ok).map(c => c.id), checkedAt: new Date().toISOString() };
    await db.runTransaction(async tx => {
      const latest = (await tx.get(revisionRef)).data();
      const state = (await tx.get(manifestRef)).data() as DeliveryState;
      const payload = (await tx.get(payloadRef)).data();
      const runDocs = await tx.get(db.collection('livDailyArticles').where('webflowItemId', '==', input.itemId).limit(10));
      const rows = runDocs.docs.map(d => ({ id: d.id, row: d.data() }));
      const entry = state?.entries.find(e => e.itemId === input.itemId);
      if (latest?.owner !== owner || latest.leaseUntil <= Date.now() || state.coverRevision?.id !== id ||
        !entry || hash(entry) !== hash(audit.entry) || hash(payload || {}) !== hash(audit.payload) ||
        hash({ rows }) !== hash({ rows: audit.rows }) || Object.values(state.slots).some(s => s.itemId === input.itemId)) return fail('conflict');
      for (const saved of audit.rows as Array<{ id: string; row: Row }>) {
        const article = presentationCheckpoint(saved.row.articleCheckpoint!, input.patch);
        tx.set(db.collection('livDailyArticles').doc(saved.id), { ...saved.row, articleCheckpoint: article, title: article.title,
          articleCheckpointHash: livImageArticleHash(article),
          preparationProof: { ...saved.row.preparationProof, expected, hash: hash(expected) },
          presentationRevisionId: id, presentationPublicationBlockers: receipt.publicationBlockers, updatedAt: FieldValue.serverTimestamp() });
      }
      tx.set(payloadRef, { ...audit.payload, expected, payloadHash: hash(expected), presentationRevisionId: id });
      entry.title = expected.title; entry.payloadHash = hash(expected);
      delete state.coverRevision;
      tx.set(manifestRef, state);
      tx.set(revisionRef, { ...latest, status: 'staged', leaseUntil: 0, receipt });
    });
    return receipt;
  } finally {
    await db.runTransaction(async tx => { const latest = (await tx.get(revisionRef)).data();
      if (latest?.owner === owner && !latest.receipt) tx.set(revisionRef, { ...latest, leaseUntil: 0 });
    }).catch(() => {});
    await lease.release();
  }
}
