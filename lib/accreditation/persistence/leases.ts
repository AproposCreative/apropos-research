import { FieldValue } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  requireFirestore,
  stripUndefined,
} from '@/lib/accreditation/persistence/firestore-kit';
import {
  isFirestorePersistence,
  resolveAccreditationPersistenceKind,
} from '@/lib/accreditation/persistence/env';

/**
 * Acquire a short-lived lease so two Vercel cron invocations cannot run the same job.
 * Returns false if another holder owns a non-expired lease.
 */
export async function tryAcquireLease(params: {
  leaseId: string;
  holderId: string;
  ttlMs?: number;
}): Promise<{ acquired: boolean; reason?: string }> {
  const ttlMs = params.ttlMs ?? 55_000;
  const now = Date.now();
  const expiresAt = new Date(now + ttlMs).toISOString();

  if (!isFirestorePersistence()) {
    // Local/test: in-process map
    const key = params.leaseId;
    const prev = memoryLeases.get(key);
    if (prev && Date.parse(prev.expiresAt) > now && prev.holderId !== params.holderId) {
      return { acquired: false, reason: 'lease held' };
    }
    memoryLeases.set(key, {
      holderId: params.holderId,
      expiresAt,
      updatedAt: new Date().toISOString(),
    });
    return { acquired: true };
  }

  const db = requireFirestore();
  const ref = db.collection(COLLECTIONS.leases).doc(params.leaseId);
  try {
    const acquired = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data();
      if (data?.expiresAt && Date.parse(String(data.expiresAt)) > now) {
        if (data.holderId !== params.holderId) return false;
      }
      tx.set(
        ref,
        stripUndefined({
          leaseId: params.leaseId,
          holderId: params.holderId,
          expiresAt,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );
      return true;
    });
    return acquired ? { acquired: true } : { acquired: false, reason: 'lease held' };
  } catch (e) {
    return {
      acquired: false,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function releaseLease(leaseId: string, holderId: string): Promise<void> {
  if (!isFirestorePersistence()) {
    const prev = memoryLeases.get(leaseId);
    if (prev?.holderId === holderId) memoryLeases.delete(leaseId);
    return;
  }
  const db = requireFirestore();
  const ref = db.collection(COLLECTIONS.leases).doc(leaseId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data()?.holderId === holderId) {
      tx.delete(ref);
    }
  });
}

const memoryLeases = new Map<string, { holderId: string; expiresAt: string; updatedAt: string }>();

export function __resetLeasesForTests(): void {
  memoryLeases.clear();
}

/**
 * Claim a send lock once (idempotency). Returns false if already claimed.
 */
export async function tryClaimSendLock(params: {
  lockKey: string;
  meta?: Record<string, unknown>;
}): Promise<{ claimed: boolean }> {
  if (!isFirestorePersistence()) {
    if (memorySendLocks.has(params.lockKey)) return { claimed: false };
    memorySendLocks.add(params.lockKey);
    return { claimed: true };
  }
  const db = requireFirestore();
  const ref = db.collection(COLLECTIONS.sendLocks).doc(params.lockKey.slice(0, 700));
  try {
    await ref.create(
      stripUndefined({
        lockKey: params.lockKey,
        createdAt: new Date().toISOString(),
        ...(params.meta || {}),
        _serverCreatedAt: FieldValue.serverTimestamp(),
      })
    );
    return { claimed: true };
  } catch {
    return { claimed: false };
  }
}

/** Release a claimed send lock after a confirmed transport failure. */
export async function releaseSendLock(lockKey: string): Promise<void> {
  if (!isFirestorePersistence()) {
    memorySendLocks.delete(lockKey);
    return;
  }
  const db = requireFirestore();
  await db
    .collection(COLLECTIONS.sendLocks)
    .doc(lockKey.slice(0, 700))
    .delete();
}

const memorySendLocks = new Set<string>();

export function __resetSendLocksForTests(): void {
  memorySendLocks.clear();
}

export function persistenceKindLabel(): string {
  return resolveAccreditationPersistenceKind();
}
