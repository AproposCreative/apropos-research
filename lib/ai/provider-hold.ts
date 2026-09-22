import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';

// Shared across both cost buckets, scoped to the configured credential. Never store the credential.
export function providerHoldId() {
  return `openai-${createHash('sha256').update(process.env.OPENAI_API_KEY || 'unconfigured').digest('hex')}`;
}
export function providerHoldRef(db: NonNullable<ReturnType<typeof getAdminDb>>) {
  return db.collection('aiProviderHolds').doc(providerHoldId());
}
export async function readProviderHold() {
  const db = getAdminDb();
  if (!db) throw new Error('provider_hold_unavailable');
  const row = (await providerHoldRef(db).get()).data();
  return { blocked: row?.blocked === true, reason: row?.blocked === true ? 'quota_exhausted' : null,
    revision: Number.isSafeInteger(row?.revision) ? row!.revision : 0,
    blockedAt: typeof row?.blockedAt === 'string' ? row.blockedAt : null };
}
/** Owner acknowledges a billing change. No probe, provider call, ledger reset or refund. */
export async function resumeProvider(expectedRevision: number, userId: string) {
  const db = getAdminDb();
  if (!db) throw new Error('provider_hold_unavailable');
  const ref = providerHoldRef(db);
  return db.runTransaction(async tx => {
    const row = (await tx.get(ref)).data();
    if (!row?.blocked || row.revision !== expectedRevision) throw new Error('provider_hold_conflict');
    const resumedAt = new Date().toISOString();
    tx.create(ref.collection('resumptions').doc(String(expectedRevision)), { userId, resumedAt, expectedRevision });
    tx.set(ref, { ...row, blocked: false, revision: expectedRevision + 1, resumedAt });
    return { blocked: false, revision: expectedRevision + 1 };
  });
}
