import { getAdminDb } from '@/lib/firebase-admin';
import { acquireCmsWriteLease } from '@/lib/seo-engine/cms-write-lease';
import { createHash } from 'node:crypto';
import { getArticleQualityState, type QualityJob } from './jobs';
import type { MetadataField } from './policy';
import { reviewKey } from './policy';
import { publishedSnapshot, type CmsSnapshot } from './snapshot';
import { getCmsSeoSlugs } from '@/lib/seo-engine/webflow-adapter';

/** Preserve metadata for ONE personally approved publication version. This is
 * not an AI review, a permanent SEO lock, or evidence of a successful publish.
 * Caller holds the shared item CMS lease through the publish/readback. */
export async function preservePublicationMetadata(input: {
  staged: CmsSnapshot; locale: 'da' | 'en'; actor: string; submissionId: string;
  approvedVersion: string; reason: 'media_only' | 'human_final_review';
}, assertLease: () => Promise<unknown>) {
  const db = getAdminDb();
  if (!db) throw Error('seo_firestore_unavailable');
  const { staged, locale } = input;
  const key = reviewKey(publishedSnapshot({ itemId: staged.id, cmsLocaleId: staged.cmsLocaleId,
    locale, live: staged, staged, slugs: getCmsSeoSlugs() }));
  const ref = db.collection('seoPostPublishArticles').doc(createHash('sha256').update(`${staged.id}:${locale}`).digest('hex'));
  await assertLease();
  await db.runTransaction(async tx => {
    const state = (await tx.get(ref)).data();
    if (state?.pendingJobId) throw Error('seo_article_write_pending');
    const audit = ref.collection('publicationPreservations').doc(key);
    if (!(await tx.get(audit)).exists) tx.create(audit, { key, actor: input.actor,
      submissionId: input.submissionId, approvedVersion: input.approvedVersion,
      reason: input.reason, createdAt: new Date().toISOString(), aiReviewed: false });
    tx.set(ref, { ...state, publicationPreservedKey: key });
  });
}

export async function setMetadataLocks(itemId: string, locale: 'da' | 'en', lockedFields: MetadataField[], actor: string) {
  const db = getAdminDb();
  if (!db) throw new Error('seo_firestore_unavailable');
  const lease = await acquireCmsWriteLease(itemId, locale);
  try {
    const id = createHash('sha256').update(`${itemId}:${locale}`).digest('hex');
    const stateRef = db.collection('seoPostPublishArticles').doc(id);
    const auditRef = stateRef.collection('lockHistory').doc();
    await lease.assertOwned();
    await db.runTransaction(async tx => {
      const before = (await tx.get(stateRef)).data()?.lockedFields || [];
      const at = new Date().toISOString();
      tx.set(stateRef, { lockedFields, locksUpdatedAt: at, locksUpdatedBy: actor }, { merge: true });
      tx.create(auditRef, { before, after: lockedFields, actor, at });
    });
    return { lockedFields };
  } finally { await lease.release(); }
}

/** Shared guard for older metadata writers. Call while holding the CMS lease. */
export async function assertEditorialMetadataWritable(itemId: string, locale: string, fields: MetadataField[]) {
  if (!fields.length) return;
  const state = await getArticleQualityState(itemId, locale);
  if (state.pendingJobId) throw Object.assign(new Error('SEO-opdatering afventer verificering'), { code: 'write_busy' });
  if (fields.some(field => state.lockedFields.includes(field))) throw Object.assign(new Error('SEO-feltet er låst af redaktionen'), { code: 'conflict' });
}

export async function listMetadataHistory(cursor?: string) {
  const db = getAdminDb();
  if (!db) throw new Error('seo_firestore_unavailable');
  const collection = db.collection('seoPostPublishJobs');
  let query = collection.orderBy('createdAt', 'desc').limit(20);
  if (cursor) {
    const previous = await collection.doc(cursor).get();
    if (!previous.exists) throw new Error('seo_history_cursor_not_found');
    query = query.startAfter(previous);
  }
  const page = await query.get();
  const rows = await Promise.all(page.docs.map(async doc => {
    const job = doc.data() as QualityJob;
    const state = await getArticleQualityState(job.snapshot.itemId, job.snapshot.locale);
    return { id: doc.id, itemId: job.snapshot.itemId, locale: job.snapshot.locale,
      title: job.article.editorialTitle, status: job.status, source: job.source, mode: job.mode,
      createdAt: job.createdAt, updatedAt: job.updatedAt, reason: job.reason || null,
      assessments: job.assessments || [],
      before: job.snapshot.metadata, proposed: job.decision?.patch || null, after: job.after?.metadata || null,
      publicReceipt: job.publicReceipt || null, evidence: job.article.performanceContext || null,
      lockedFields: state.lockedFields, pendingVerification: Boolean(state.pendingJobId) };
  }));
  return { rows, nextCursor: page.docs.length === 20 ? page.docs[page.docs.length - 1].id : null };
}
