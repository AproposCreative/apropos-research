import { randomUUID } from 'node:crypto';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { inspectLivCmsDraft } from '@/lib/liv/cms-readback';
import { publishVerifiedLivArticle, verifyLiveLivArticle } from '@/lib/liv/publish-verified';
import { readSubmission, submissionStore } from './submissions';
import { assertPublicationEnabled } from '@/lib/mcp/publication';
import type { WebflowArticleFields } from '@/lib/webflow/types';
import { submissionPreviewBlocks } from './submission-preview';
import { activeMember } from '@/lib/mcp/oauth';
import { approvedSubmissionPolicy } from './submission-policy';
import { readSubmissionCms } from './submission-published-target';
import { acquireCmsWriteLease } from '@/lib/seo-engine/cms-write-lease';
import { preservePublicationMetadata } from '@/lib/seo-engine/post-publish/editorial';
import type { CmsSnapshot } from '@/lib/seo-engine/post-publish/snapshot';

type Prepared = { itemId: string; expected: WebflowArticleFields; proof: { fieldDataHash: string } };
type Publication = { uid: string; preparedHash: string; contentHash: string; cmsHash: string; publishAt: string;
  acceptedAt: string; attempted?: boolean; fieldDataHash?: string; receipt?: unknown };
export async function readSubmissionPublication(uid: string, id: string) {
  const row = await readSubmission(uid, id) as Awaited<ReturnType<typeof readSubmission>> & { prepared?: Prepared; publication?: Publication };
  if (row.status !== 'published' || !row.prepared || !row.publication?.fieldDataHash) return { publicationVerified: false as const };
  return verifyLiveLivArticle({ itemId: row.prepared.itemId, expected: row.prepared.expected, fieldDataHash: row.publication.fieldDataHash });
}
export function copenhagenPublicationInstant(value: string, now = Date.now()) {
  if (value === 'now') return new Date(now).toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error('mcp_submission_invalid_schedule');
  const format = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const matches = [1, 2].map(offset => Date.parse(`${value}:00Z`) - offset * 3_600_000)
    .filter(time => Number.isFinite(time) && format.format(new Date(time)).replace(' ', 'T') === value);
  if (matches.length !== 1 || matches[0] <= now || matches[0] > now + 31 * 86_400_000) throw Error('mcp_submission_invalid_schedule');
  return new Date(matches[0]).toISOString();
}

export async function submissionPublicationPreview(uid: string, id: string) {
  const row = await readSubmission(uid, id) as Awaited<ReturnType<typeof readSubmission>> & { prepared?: Prepared; preparedHash?: string; assets?: unknown };
  if (row.status !== 'prepared' || !row.prepared || !row.preparedHash) return { ready: false, status: row.status };
  const { itemId, expected } = row.prepared;
  if (row.preparedHash !== cmsFieldHash({ expected, assets: row.assets })) throw Error('mcp_submission_prepared_version_changed');
  const proof = await inspectLivCmsDraft({ itemId, expected, inspectionPolicy: approvedSubmissionPolicy(row) });
  if (!proof.draftConfirmed || !proof.publicationReady || !proof.checks.length || proof.checks.some(c => !c.ok) || proof.fieldDataHash !== row.prepared.proof.fieldDataHash) {
    return { ready: false, status: 'cms_changed', blockers: proof.checks.filter(c => !c.ok).map(c => c.id) };
  }
  return { ready: true, revision: row.revision, contentHash: row.contentHash, preparedHash: row.preparedHash,
    cmsHash: proof.fieldDataHash, itemId, article: expected, assets: row.assets,
    blocks: submissionPreviewBlocks(expected.content), checkedAt: proof.checkedAt };
}

/** Authenticated personal UI only: first-party or a version-bound MCP App click. */
export async function approveSubmissionPublication(uid: string, id: string, preparedHash: string, localTime: string) {
  assertPublicationEnabled();
  const preview = await submissionPublicationPreview(uid, id);
  if (!preview.ready || preview.preparedHash !== preparedHash) throw Error('mcp_submission_preview_changed');
  const publishAt = copenhagenPublicationInstant(localTime);
  const { db, collection } = submissionStore(), ref = collection.doc(id);
  return db.runTransaction(async tx => {
    const row = (await tx.get(ref)).data();
    if (!row || row.uid !== uid || row.status !== 'prepared' || row.preparedHash !== preparedHash || row.contentHash !== preview.contentHash) throw Error('mcp_submission_preview_changed');
    const publication: Publication = { uid, preparedHash, contentHash: row.contentHash, cmsHash: preview.cmsHash!, publishAt, acceptedAt: new Date().toISOString() };
    tx.create(ref.collection('publicationApprovals').doc(preparedHash), publication);
    tx.update(ref, { status: 'scheduled', publication, updatedAt: publication.acceptedAt });
    return { status: 'scheduled', publishAt, publicationVerified: false };
  });
}

/** Independent item operation. Never consumes or fabricates a Liv daily slot. */
export async function publishSubmission(uid: string, id: string, now = new Date()) {
  const { db, collection } = submissionStore(), ref = collection.doc(id), token = randomUUID();
  const row = await db.runTransaction(async tx => {
    const row = (await tx.get(ref)).data();
    if (!row || row.uid !== uid || row.status !== 'scheduled' || !row.publication || Date.parse(row.publication.publishAt) > now.getTime() ||
        (row.publishLeaseUntil || 0) > Date.now() || (row.reconcileAfter || 0) > Date.now()) return null;
    if (row.publication.uid !== uid || row.publication.preparedHash !== row.preparedHash || row.publication.contentHash !== row.contentHash) throw Error('mcp_submission_preview_changed');
    tx.update(ref, { publishToken: token, publishLeaseUntil: Date.now() + 300_000 }); return row;
  });
  if (!row) return { status: 'not_dispatched', publicationVerified: false };
  const prepared = row.prepared as Prepared, publication = row.publication as Publication;
  let cmsLease: Awaited<ReturnType<typeof acquireCmsWriteLease>> | undefined;
  const assertLease = async () => {
    const latest = (await ref.get()).data();
    if (latest?.publishToken !== token || latest.preparedHash !== publication.preparedHash || latest.contentHash !== publication.contentHash || latest.publishLeaseUntil <= Date.now()) throw Error('mcp_submission_preview_changed');
    await cmsLease?.assertOwned();
  };
  try {
    let receipt;
    if (publication.attempted) {
      if (!publication.fieldDataHash) throw Error('mcp_submission_publication_unconfirmed');
      receipt = await verifyLiveLivArticle({ itemId: prepared.itemId, expected: prepared.expected, fieldDataHash: publication.fieldDataHash });
    } else {
      if (!await activeMember(uid, Date.parse(publication.acceptedAt))) throw Error('mcp_submission_owner_access_changed');
      cmsLease = await acquireCmsWriteLease(prepared.itemId, 'da');
      assertPublicationEnabled(); await assertLease();
      const inspectionPolicy = approvedSubmissionPolicy(row as unknown as Awaited<ReturnType<typeof readSubmission>>);
      const fresh = await inspectLivCmsDraft({ itemId: prepared.itemId, expected: prepared.expected, inspectionPolicy });
      if (fresh.fieldDataHash !== publication.cmsHash) throw Error('mcp_submission_preview_changed');
      receipt = await publishVerifiedLivArticle({ itemId: prepared.itemId, expected: prepared.expected,
        ...(row.publishedTarget ? {} : { publicationDate: publication.publishAt }), assertLease, inspectionPolicy,
        beforePublish: async fieldDataHash => {
          if (row.publishedTarget || row.choices?.aiFinalChecks === 'human') {
            const staged = await readSubmissionCms(prepared.itemId);
            if (cmsFieldHash(staged.fieldData as Record<string, unknown>) !== fieldDataHash) throw Error('mcp_submission_cms_conflict');
            await preservePublicationMetadata({ staged: staged as CmsSnapshot, locale: 'da', actor: uid,
              submissionId: id, approvedVersion: publication.preparedHash,
              reason: row.publishedTarget ? 'media_only' : 'human_final_review' }, assertLease);
          }
          await db.runTransaction(async tx => {
            const current = (await tx.get(ref)).data();
            if (current?.publishToken !== token || current.publication?.attempted || current.preparedHash !== publication.preparedHash) throw Error('mcp_submission_publication_unconfirmed');
            tx.update(ref, { publication: { ...publication, attempted: true, fieldDataHash } });
          });
        } });
    }
    await assertLease();
    const savedPublication = (await ref.get()).data()!.publication;
    const cms = await readSubmissionCms(prepared.itemId);
    const fields = cms.fieldData as Record<string, unknown>;
    if (cmsFieldHash(fields) !== savedPublication.fieldDataHash) throw Error('mcp_submission_cms_conflict');
    await ref.update({ status: 'published', publication: { ...savedPublication, receipt },
      publishedTarget: { itemId: prepared.itemId, fields, fieldDataHash: cmsFieldHash(fields), linkedAt: new Date().toISOString() },
      updatedAt: new Date().toISOString() });
    return { ...receipt, status: 'published', publicationOrigin: 'editor-approved-submission', countsAsUnattendedLiv: false };
  } catch (error) {
    const blocker = error instanceof Error && error.message.startsWith('mcp_submission_') ? error.message : 'mcp_submission_publication_unconfirmed';
    // An ambiguous write remains scheduled for read-only reconciliation. A
    // known conflict needs a new preview, never a fresh blind publication.
    const current = (await ref.get()).data();
    if (current?.publishToken === token) await ref.update({ ...(current?.publication?.attempted ? {} : { status: 'blocked' }),
      blocker, reconcileAfter: Date.now() + 15 * 60_000 });
    return { status: 'reconciliation_required', publicationVerified: false, blocker };
  } finally {
    await cmsLease?.release();
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (current?.publishToken === token) tx.update(ref, { publishLeaseUntil: 0 });
    });
  }
}
