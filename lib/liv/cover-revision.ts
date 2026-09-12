import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { validDay, type DeliveryState } from '@/lib/liv/delivery-policy';
import { readLivWebflowJson, inspectLivCmsDraft, type LivCmsReadback } from '@/lib/liv/cms-readback';
import { patchArticleFieldDataForLocale } from '@/lib/webflow/locale-items';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import { prepareCoverSource, reviewCover, verifyCoverImage, validateCoverSource, type PreparedCover } from '@/lib/liv/cover-revision-media';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
import type { PreparationProof } from '@/lib/liv/prepared-admission';
import type { WebflowArticleFields } from '@/lib/webflow/types';

const boundedText = (max: number) => z.string().trim().min(10).max(max).refine(value =>
  !/[<>\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(value));
export const coverRevisionInput = z.object({
  dayKey: z.string().refine(validDay), itemId: z.string().regex(/^[a-f0-9]{24}$/),
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/), reason: boundedText(500),
  expectedPayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedCmsHash: z.string().regex(/^[a-f0-9]{64}$/), replaceMobile: z.boolean().optional(),
  imageUrl: z.string().url().max(2000), sourcePageUrl: z.string().url().max(2000),
  alt: boundedText(240), caption: boundedText(350),
}).strict();
export type CoverRevisionInput = z.infer<typeof coverRevisionInput>;
type Json = Record<string, unknown>;
type SavedPreparation = { id: string; row: Json & { articleCheckpoint?: GeneratedArticle; preparationProof?: PreparationProof } };
type Audit = { input: CoverRevisionInput; cms: Json; schema: Json; slot: DeliveryState['slots'][string];
  entry: DeliveryState['entries'][number]; payload: Json & { expected: WebflowArticleFields; payloadHash: string };
  preparations: SavedPreparation[] };
type Revision = { inputHash: string; owner: string; leaseUntil: number; status: 'processing' | 'staged';
  prepared?: PreparedCover; reviewStarted?: boolean; review?: Awaited<ReturnType<typeof reviewCover>>;
  patchStarted?: boolean; inspection?: LivCmsReadback; receipt?: CoverRevisionReceipt };
export type CoverRevisionReceipt = { status: 'cover_staged'; revisionId: string; itemId: string;
  payloadHash: string; fieldDataHash: string; publicationVerified: false };
export type CoverRevisionDependencies = {
  collectionId: string; localeId: string;
  read: typeof readLivWebflowJson; inspect: typeof inspectLivCmsDraft;
  patch: typeof patchArticleFieldDataForLocale;
  prepare: typeof prepareCoverSource; review: typeof reviewCover; verifyImage: typeof verifyCoverImage;
};
const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const fingerprint = (value: object) => cmsFieldHash(value as Json);
const fail = (reason: string): never => { throw new Error(`liv_cover_${reason}`); };
const withoutCover = (fields: Json, mobile: boolean) => Object.fromEntries(Object.entries(fields)
  .filter(([key]) => !['thumb', 'foto-credit', ...(mobile ? ['mobile-image'] : [])].includes(key)));
const receiptFor = (id: string, input: CoverRevisionInput, payloadHash: string, fieldDataHash: string): CoverRevisionReceipt =>
  ({ status: 'cover_staged', revisionId: id, itemId: input.itemId, payloadHash, fieldDataHash, publicationVerified: false });

function draftFields(cms: Json, input: CoverRevisionInput, localeId: string, expected: WebflowArticleFields) {
  const fields = object(cms.fieldData);
  if (cms.id !== input.itemId || cms.cmsLocaleId !== localeId || cms.isDraft !== true || cms.isArchived === true ||
      cms.lastPublished !== null || fields.name !== expected.title || fields.slug !== expected.slug ||
      fields['ai-generated'] !== (expected.aiGenerated ?? true)) fail('draft_changed');
  return fields;
}

function revisedCheckpoint(article: GeneratedArticle, cover: PreparedCover, id: string): GeneratedArticle {
  if (!article.selectedImage || !article.preparedMedia || article.preparedMedia.length !== 3 ||
      new Set(article.preparedMedia.map(image => image.role)).size !== 3 ||
      !article.preparedMedia.some(image => image.role === 'hero')) return fail('checkpoint_conflict');
  const sourceHash = cover.original.contentHash;
  return { ...article, selectedImage: { id, articleHash: livImageArticleHash(article), ...cover.image,
    width: 1920, height: 1080, sourceUrl: cover.source.imageUrl, sourcePageUrl: cover.source.sourcePageUrl,
    sourceHash, alt: cover.source.alt, credit: cover.credit, createdAt: cover.retrievedAt,
    rightsStatus: 'unverified', visualReview: 'automated' },
  preparedMedia: article.preparedMedia.map(image => image.role !== 'hero' ? image : {
    ...cover.image, role: 'hero', alt: cover.source.alt, caption: cover.source.caption, credit: cover.credit,
    sourceUrl: cover.source.imageUrl, sourcePageUrl: cover.source.sourcePageUrl, sourceHash, kind: 'photography',
  }) };
}

/** Authenticated route only. One staged mutation, fenced against the normal publisher.
 * No history reset, new item, publication, text generation or body-image processing. */
export async function reviseLivCover(value: unknown, dependencies?: CoverRevisionDependencies): Promise<CoverRevisionReceipt> {
  const parsed = coverRevisionInput.safeParse(value);
  if (!parsed.success) return fail('invalid');
  const input = parsed.data;
  try { validateCoverSource(input); } catch { return fail('invalid_source'); }
  const db = getAdminDb();
  if (!db) return fail('store_unavailable');
  const deps = dependencies ?? { collectionId: getWebflowConfig().articlesCollectionId || env.WEBFLOW_ARTICLES_COLLECTION_ID || '',
    localeId: env.WEBFLOW_CMS_LOCALE_DK || '', read: readLivWebflowJson, inspect: inspectLivCmsDraft,
    patch: patchArticleFieldDataForLocale, prepare: prepareCoverSource, review: reviewCover, verifyImage: verifyCoverImage };
  if (![deps.collectionId, deps.localeId].every(id => /^[a-f0-9]{24}$/.test(id))) return fail('configuration');
  const id = fingerprint({ itemId: input.itemId, requestId: input.requestId });
  const inputHash = fingerprint(input), owner = randomUUID();
  const revisionRef = db.collection('livCoverRevisions').doc(id);
  const auditRef = db.collection('livCoverRevisionAudits').doc(id);
  const manifestRef = db.collection('livDelivery').doc('manifest');
  const payloadRef = db.collection('livDelivery').doc(`item-${input.itemId}`);
  const cmsPath = `collections/${deps.collectionId}/items/${input.itemId}?cmsLocaleId=${deps.localeId}`;
  // A completed replay needs no external calls. The transaction checks again.
  const existing = (await revisionRef.get()).data() as Revision | undefined;
  if (existing && existing.inputHash !== inputHash) return fail('request_conflict');
  const cms = existing ? null : await deps.read(cmsPath);
  const schema = existing ? null : await deps.read(`collections/${deps.collectionId}`);
  const claimed = await db.runTransaction(async tx => {
    const previous = (await tx.get(revisionRef)).data() as Revision | undefined;
    if (previous?.inputHash && previous.inputHash !== inputHash) return fail('request_conflict');
    if (previous?.status === 'staged' && previous.receipt) return { revision: previous, audit: null };
    const state = (await tx.get(manifestRef)).data() as DeliveryState | undefined;
    const payload = (await tx.get(payloadRef)).data() as Audit['payload'] | undefined;
    const slot = state?.slots[input.dayKey];
    const entry = state?.entries.find(row => row.itemId === input.itemId);
    if (!state || !slot || slot.itemId !== input.itemId || slot.state !== 'selected' || slot.fieldDataHash || slot.publicUrl ||
        !entry || entry.state !== 'selected' || entry.decision === 'rejected' || !payload?.expected ||
        fingerprint(payload.expected) !== input.expectedPayloadHash || payload.payloadHash !== input.expectedPayloadHash ||
        entry.payloadHash !== input.expectedPayloadHash) return fail('conflict');
    if (state.preparation && state.preparation.leaseUntil > Date.now()) return fail('busy');
    let audit: Audit;
    if (previous) {
      if (previous.leaseUntil > Date.now()) return fail('busy');
      if (state.coverRevision?.id !== id || state.coverRevision.itemId !== input.itemId || state.coverRevision.day !== input.dayKey) return fail('hold_lost');
      const savedAudit = (await tx.get(auditRef)).data() as Audit | undefined;
      if (!savedAudit || fingerprint(savedAudit.input) !== inputHash) return fail('audit_invalid');
      audit = savedAudit;
    } else {
      if (state.coverRevision || slot.leaseUntil > Date.now() || !cms) return fail('busy');
      const schemaFields = Array.isArray(schema?.fields) ? schema.fields.map(object) : [];
      if (schema?.id !== deps.collectionId || !schemaFields.some(field => field.slug === 'thumb' && field.type === 'Image') ||
          !schemaFields.some(field => field.slug === 'foto-credit' && field.type === 'PlainText') ||
          (input.replaceMobile && !schemaFields.some(field => field.slug === 'mobile-image' && field.type === 'Image'))) return fail('schema_invalid');
      const fields = draftFields(cms, input, deps.localeId, payload.expected);
      if (fingerprint(fields) !== input.expectedCmsHash) return fail('draft_changed');
      const preparations = await tx.get(db.collection('livDailyArticles').where('webflowItemId', '==', input.itemId).limit(10));
      const rows = preparations.docs.map(doc => ({ id: doc.id, row: doc.data() })) as SavedPreparation[];
      if (!rows.length || rows.length >= 10 || rows.some(saved => saved.row.status === 'published') ||
          !rows.some(saved => saved.row.articleCheckpoint && saved.row.preparationProof)) return fail('checkpoint_conflict');
      for (const { row } of rows) {
        if (row.preparationProof && (row.preparationProof.hash !== input.expectedPayloadHash ||
          fingerprint(row.preparationProof.expected) !== input.expectedPayloadHash || row.preparationProof.editorialPassed !== true ||
          row.preparationProof.structurePassed !== true)) return fail('checkpoint_conflict');
        if (row.articleCheckpoint && (row.articleCheckpoint.content !== payload.expected.content ||
          row.articleCheckpoint.selectedImage?.contentHash !== payload.expected.featuredImageHash ||
          row.articleCheckpoint.selectedImage.articleHash !== livImageArticleHash(row.articleCheckpoint))) return fail('checkpoint_conflict');
      }
      audit = { input, cms, schema, payload, slot: { ...slot }, entry: { ...entry }, preparations: rows };
      // Immutable before-image, including raw Firestore timestamps and prior proofs.
      tx.create(auditRef, { ...audit, authorizedBy: 'cron-authenticated-operator', selection: 'explicit-human-selection',
        createdAt: FieldValue.serverTimestamp() });
    }
    const revision: Revision = { ...previous, inputHash, owner, leaseUntil: Date.now() + 330_000, status: 'processing' };
    // Preserve attempts, backoff, dates and all diagnostics; only fence ownership.
    slot.token = owner;
    state.coverRevision = { id, itemId: input.itemId, day: input.dayKey };
    tx.set(revisionRef, revision);
    tx.set(manifestRef, state);
    return { revision, audit };
  });
  if (claimed.revision.receipt) return claimed.revision.receipt;
  const audit = claimed.audit!;
  let revision = claimed.revision;
  const save = async (patch: Partial<Revision>) => {
    await db.runTransaction(async tx => {
      const latest = (await tx.get(revisionRef)).data() as Revision | undefined;
      const state = (await tx.get(manifestRef)).data() as DeliveryState | undefined;
      if (latest?.owner !== owner || latest.leaseUntil <= Date.now() || state?.coverRevision?.id !== id ||
          state.slots[input.dayKey]?.token !== owner) return fail('hold_lost');
      tx.set(revisionRef, { ...latest, ...patch });
      if (patch.inspection) tx.create(db.collection('livCoverRevisionReadbacks').doc(randomUUID()),
        { revisionId: id, itemId: input.itemId, inspection: patch.inspection });
    });
    revision = { ...revision, ...patch };
  };
  try {
    if (!revision.prepared) await save({ prepared: await deps.prepare(id, input) });
    const cover = revision.prepared!;
    if (!revision.review) {
      if (revision.reviewStarted) return fail('review_requires_reconciliation');
      await save({ reviewStarted: true });
      await save({ review: await deps.review(cover, audit.payload.expected) });
    }
    if (revision.review?.pass !== true || revision.review.contentHash !== cover.image.contentHash) return fail('visual_rejected');
    const expected = { ...audit.payload.expected, featuredImage: cover.image.url, featuredImageAlt: input.alt,
      featuredImageHash: cover.image.contentHash, fotoCredit: cover.credit,
      imageSourceUrls: [...new Set([...(audit.payload.expected.imageSourceUrls || []), input.sourcePageUrl])] };
    const baseline = object(audit.cms.fieldData);
    const mobile = input.replaceMobile === true;
    const current = draftFields(await deps.read(cmsPath), input, deps.localeId, expected);
    if (fingerprint(withoutCover(current, mobile)) !== fingerprint(withoutCover(baseline, mobile))) return fail('draft_changed');
    if (!revision.patchStarted) {
      if (fingerprint(current) !== fingerprint(baseline)) return fail('draft_changed');
      // Once intent exists, all retries are reads only, even after a lost response.
      await save({ patchStarted: true });
      await deps.patch(input.itemId, { thumb: { url: cover.image.url, alt: input.alt }, 'foto-credit': cover.credit,
        ...(mobile ? { 'mobile-image': { url: cover.image.url, alt: input.alt } } : {}) }, deps.localeId);
    }
    const after = draftFields(await deps.read(cmsPath), input, deps.localeId, expected);
    if (fingerprint(withoutCover(after, mobile)) !== fingerprint(withoutCover(baseline, mobile)) ||
        object(after.thumb).alt !== input.alt || after['foto-credit'] !== cover.credit ||
        (mobile && object(after['mobile-image']).alt !== input.alt)) return fail('patch_requires_reconciliation');
    if (mobile && !await deps.verifyImage(String(object(after['mobile-image']).url || ''), cover)) return fail('mobile_mismatch');
    // The existing full readback validates hero bytes, original body derivatives,
    // references, structure and AI flag. It performs no text/model gate calls.
    const inspection = await deps.inspect({ itemId: input.itemId, expected });
    await save({ inspection });
    if (inspection.itemId !== input.itemId || inspection.localeId !== deps.localeId || !inspection.draftConfirmed ||
        !inspection.publicationReady || !inspection.checks.length || inspection.checks.some(check => !check.ok) ||
        inspection.fieldDataHash !== fingerprint(after)) return fail('readback_failed');
    const finalFields = draftFields(await deps.read(cmsPath), input, deps.localeId, expected);
    if (fingerprint(finalFields) !== inspection.fieldDataHash) return fail('draft_changed');
    const payloadHash = fingerprint(expected);
    const receipt = receiptFor(id, input, payloadHash, inspection.fieldDataHash);
    await db.runTransaction(async tx => {
      const latest = (await tx.get(revisionRef)).data() as Revision | undefined;
      const state = (await tx.get(manifestRef)).data() as DeliveryState;
      const payload = (await tx.get(payloadRef)).data();
      const preparations = await tx.get(db.collection('livDailyArticles').where('webflowItemId', '==', input.itemId).limit(10));
      const rows = preparations.docs.map(doc => ({ id: doc.id, row: doc.data() }));
      const slot = state?.slots[input.dayKey];
      const entry = state?.entries.find(row => row.itemId === input.itemId);
      if (latest?.owner !== owner || latest.leaseUntil <= Date.now() || state?.coverRevision?.id !== id ||
          slot?.token !== owner || slot.state !== 'selected' || slot.itemId !== input.itemId ||
          !entry || entry.state !== 'selected' || entry.decision === 'rejected' || entry.payloadHash !== input.expectedPayloadHash ||
          fingerprint({ ...slot, token: audit.slot.token }) !== fingerprint(audit.slot) || fingerprint(payload || {}) !== fingerprint(audit.payload) ||
          fingerprint({ rows }) !== fingerprint({ rows: audit.preparations })) return fail('conflict');
      // Active values change only here, after full readback; the audit is never overwritten.
      for (const saved of audit.preparations) {
        const row = saved.row;
        tx.set(db.collection('livDailyArticles').doc(saved.id), { ...row,
          ...(row.articleCheckpoint ? { articleCheckpoint: revisedCheckpoint(row.articleCheckpoint, cover, id) } : {}),
          ...(row.preparationProof ? { preparationProof: { ...row.preparationProof, expected, hash: payloadHash } } : {}),
          coverRevisionId: id, updatedAt: FieldValue.serverTimestamp() });
      }
      tx.set(payloadRef, { ...audit.payload, expected, payloadHash, coverRevisionId: id });
      entry.payloadHash = payloadHash;
      // Never change the existing failure allowance/backoff or the selected state.
      delete state.coverRevision;
      tx.set(manifestRef, state);
      tx.set(revisionRef, { ...latest, status: 'staged', leaseUntil: 0, receipt, completedAt: FieldValue.serverTimestamp() });
    });
    return receipt;
  } finally {
    // Retain the mutation hold on failure. Only the identical request may resume.
    await db.runTransaction(async tx => {
      const latest = (await tx.get(revisionRef)).data() as Revision | undefined;
      if (latest?.owner === owner && latest.status !== 'staged') tx.set(revisionRef, { ...latest, leaseUntil: 0 });
    }).catch(() => {});
  }
}
