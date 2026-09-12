import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from './cms-field-hash';
import { LIV_EDITORIAL_KINDS, editorialKindForArticle } from './editorial-kind';
import type { DeliveryState } from './delivery-policy';

export const editorialKindOperationInput = z.object({
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  itemId: z.string().regex(/^[a-f0-9]{24}$/),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  editorialKind: z.enum(LIV_EDITORIAL_KINDS),
  reason: z.string().trim().min(3).max(300).refine(value => !/[<>\x00-\x1f]/.test(value)),
}).strict();

/** Authenticated operator metadata only. Shares the delivery transaction lock;
 * never writes CMS payloads, proof hashes, preparation work or approval decisions. */
export async function setLivEditorialKind(value: unknown) {
  const parsed = editorialKindOperationInput.safeParse(value);
  if (!parsed.success) throw new Error('liv_editorial_kind_invalid');
  const input = parsed.data, inputHash = cmsFieldHash(input);
  const db = getAdminDb();
  if (!db) throw new Error('liv_editorial_kind_unavailable');
  const manifest = db.collection('livDelivery').doc('manifest');
  const item = db.collection('livDelivery').doc(`item-${input.itemId}`);
  const audit = item.collection('editorialKinds').doc(input.requestId);
  return db.runTransaction(async tx => {
    const prior = (await tx.get(audit)).data();
    const state = (await tx.get(manifest)).data() as DeliveryState | undefined;
    const payload = (await tx.get(item)).data();
    if (!payload?.expected || payload.payloadHash !== input.payloadHash || cmsFieldHash(payload.expected) !== input.payloadHash) {
      throw new Error('liv_editorial_kind_conflict');
    }
    if (prior) {
      if (prior.inputHash !== inputHash) throw new Error('liv_editorial_kind_conflict');
      return { status: 'already_recorded' as const, itemId: input.itemId, editorialKind: input.editorialKind };
    }
    const matches = state?.entries?.filter(entry => entry.itemId === input.itemId) || [];
    const entry = matches[0];
    if (matches.length !== 1 || entry.state !== 'ready' || entry.payloadHash !== input.payloadHash || state?.coverRevision ||
      Object.values(state?.slots || {}).some(slot => slot.itemId === input.itemId) ||
      editorialKindForArticle(input.editorialKind, payload.expected.articleFormat) !== input.editorialKind) {
      throw new Error('liv_editorial_kind_conflict');
    }
    tx.create(audit, { input, inputHash, previousEditorialKind: entry.editorialKind ?? null,
      authority: 'cron-authenticated-operator', recordedAt: new Date().toISOString() });
    entry.editorialKind = input.editorialKind;
    tx.set(manifest, state!);
    return { status: 'recorded' as const, itemId: input.itemId, editorialKind: input.editorialKind };
  });
}
