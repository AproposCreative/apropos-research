import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import type {
  OpportunityAuditEntry,
  OpportunityMetaVersion,
  OpportunityStatus,
  SeoOpportunity,
} from '@/lib/seo-engine/opportunity-engine/types';

export const OPP_COL = {
  opportunities: 'seoEngineOpportunities',
  versions: 'seoEngineOpportunityVersions',
  audit: 'seoEngineOpportunityAudit',
  scans: 'seoEngineOpportunityScans',
  urlCooldown: 'seoEngineOpportunityUrlCooldown',
  idempotency: 'seoEngineOpportunityIdempotency',
} as const;

function requireDb(): Firestore {
  const db = getAdminDb();
  if (!db) throw new Error('Firestore er ikke tilgængelig');
  return db;
}

export function opportunityDocId(fingerprint: string): string {
  return createHash('sha256').update(fingerprint).digest('hex').slice(0, 32);
}

const COOLDOWN_MS = 14 * 86_400_000;

function isAppliedWithinCooldown(appliedAt: string | null | undefined, nowIso: string): boolean {
  if (!appliedAt) return false;
  const t = Date.parse(appliedAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(t) || !Number.isFinite(now)) return false;
  return now - t < COOLDOWN_MS;
}

/** Idempotent upsert by fingerprint — refreshes score/evidence, preserves status if not open. */
export async function upsertOpportunity(
  opp: Omit<SeoOpportunity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<SeoOpportunity> {
  const db = requireDb();
  const id = opp.id || opportunityDocId(opp.fingerprint);
  const ref = db.collection(OPP_COL.opportunities).doc(id);
  const existing = await ref.get();
  const now = new Date().toISOString();

  if (!existing.exists) {
    const doc: SeoOpportunity = {
      ...opp,
      id,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      versionIds: [],
    };
    await ref.set(stripUndefined(doc as unknown as Record<string, unknown>));
    return doc;
  }

  const prev = existing.data() as SeoOpportunity;
  const merged: SeoOpportunity = {
    ...prev,
    ...opp,
    id,
    status: 'open',
    createdAt: prev.createdAt || now,
    updatedAt: now,
    versionIds: prev.versionIds || [],
  };
  // Rejected / dismissed stay closed unless ops reopen manually
  if (prev.status === 'rejected' || prev.status === 'dismissed') {
    merged.status = prev.status;
  } else if (prev.status === 'approved') {
    merged.status = 'approved';
  } else if (prev.status === 'applied' || prev.status === 'rolled_back') {
    // Reopen after cooldown when fingerprint/evidence materially changed — never lock forever
    const cooldownExpired = !isAppliedWithinCooldown(prev.appliedAt, now);
    const evidenceChanged =
      prev.fingerprint !== opp.fingerprint ||
      prev.idempotencyKey !== opp.idempotencyKey ||
      Math.abs((prev.score || 0) - (opp.score || 0)) >= 8;
    if (cooldownExpired && evidenceChanged) {
      merged.status = 'open';
      merged.skipReason = null;
      merged.appliedAt = prev.appliedAt;
      merged.versionIds = prev.versionIds || [];
    } else {
      merged.status = prev.status;
    }
  } else if (prev.status === 'skipped') {
    // Skipped items reopen on later scan with fresh evidence
    merged.status = 'open';
    merged.skipReason = null;
  }
  await ref.set(stripUndefined(merged as unknown as Record<string, unknown>), { merge: true });
  return merged;
}

export async function listOpportunities(args?: {
  status?: OpportunityStatus | 'all';
  limit?: number;
}): Promise<SeoOpportunity[]> {
  const db = requireDb();
  const limit = Math.min(200, Math.max(1, args?.limit || 50));
  const status = args?.status || 'open';
  try {
    let q = db.collection(OPP_COL.opportunities).orderBy('score', 'desc').limit(limit);
    if (status !== 'all') {
      q = db
        .collection(OPP_COL.opportunities)
        .where('status', '==', status)
        .orderBy('score', 'desc')
        .limit(limit);
    }
    const snap = await q.get();
    return snap.docs.map((d) => ({ ...(d.data() as SeoOpportunity), id: d.id }));
  } catch {
    // Fallback without composite index
    const snap = await db.collection(OPP_COL.opportunities).limit(limit * 3).get();
    let rows = snap.docs.map((d) => ({ ...(d.data() as SeoOpportunity), id: d.id }));
    if (status !== 'all') rows = rows.filter((r) => r.status === status);
    return rows.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

export async function getOpportunity(id: string): Promise<SeoOpportunity | null> {
  const db = requireDb();
  const snap = await db.collection(OPP_COL.opportunities).doc(id).get();
  if (!snap.exists) return null;
  return { ...(snap.data() as SeoOpportunity), id: snap.id };
}

export async function updateOpportunityStatus(args: {
  id: string;
  status: OpportunityStatus;
  actor: string;
  extra?: Partial<SeoOpportunity>;
}): Promise<SeoOpportunity> {
  const db = requireDb();
  const ref = db.collection(OPP_COL.opportunities).doc(args.id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Opportunity ikke fundet');
  const prev = snap.data() as SeoOpportunity;
  const next: SeoOpportunity = {
    ...prev,
    ...args.extra,
    id: args.id,
    status: args.status,
    updatedAt: new Date().toISOString(),
  };
  await ref.set(stripUndefined(next as unknown as Record<string, unknown>), { merge: true });
  await appendAudit({
    actor: args.actor,
    action:
      args.status === 'approved'
        ? 'approve'
        : args.status === 'rejected'
          ? 'reject'
          : args.status === 'applied'
            ? 'apply'
            : args.status === 'rolled_back'
              ? 'rollback'
              : args.status === 'skipped'
                ? 'skip'
                : 'dismiss',
    opportunityId: args.id,
    detail: `status=${args.status}`,
  });
  return next;
}

export async function saveMetaVersion(
  version: Omit<OpportunityMetaVersion, 'id'> & { id?: string }
): Promise<OpportunityMetaVersion> {
  const db = requireDb();
  const id =
    version.id ||
    createHash('sha256')
      .update(`${version.opportunityId}:${version.field}:${version.appliedAt}`)
      .digest('hex')
      .slice(0, 28);
  const doc: OpportunityMetaVersion = { ...version, id };
  await db
    .collection(OPP_COL.versions)
    .doc(id)
    .set(stripUndefined(doc as unknown as Record<string, unknown>));
  return doc;
}

export async function getMetaVersion(id: string): Promise<OpportunityMetaVersion | null> {
  const db = requireDb();
  const snap = await db.collection(OPP_COL.versions).doc(id).get();
  if (!snap.exists) return null;
  return { ...(snap.data() as OpportunityMetaVersion), id: snap.id };
}

export async function appendAudit(
  entry: Omit<OpportunityAuditEntry, 'id' | 'at'> & { at?: string }
): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  const at = entry.at || new Date().toISOString();
  const id = createHash('sha256')
    .update(`${at}:${entry.actor}:${entry.action}:${entry.opportunityId || ''}:${entry.detail || ''}`)
    .digest('hex')
    .slice(0, 28);
  await db
    .collection(OPP_COL.audit)
    .doc(id)
    .set({
      id,
      at,
      actor: entry.actor,
      action: entry.action,
      opportunityId: entry.opportunityId || null,
      detail: entry.detail || null,
      createdAt: FieldValue.serverTimestamp(),
    });
}

export async function saveScanSummary(args: {
  scanId: string;
  status: string;
  statusMessage: string;
  opportunityCount: number;
  source: string;
}): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  await db.collection(OPP_COL.scans).doc(args.scanId).set(
    {
      ...args,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Idempotency claim for daily/weekly cron — returns false if a successful run
 * still holds the lease. Failed/released slots may be retried immediately.
 */
export async function claimOpportunityCronSlot(args: {
  slotKey: string;
  ttlHours?: number;
}): Promise<boolean> {
  const db = getAdminDb();
  if (!db) return true; // allow run without persistence in local/dev
  const ref = db.collection(OPP_COL.scans).doc(`cron:${args.slotKey}`);
  try {
    const ok = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const data = snap.data() || {};
        const status = data.status as string | undefined;
        // Failed or explicitly released → allow retry
        if (status === 'failed' || status === 'released') {
          /* fall through to claim */
        } else if (status === 'succeeded') {
          const completedAt = data.completedAt as string | undefined;
          if (completedAt) {
            const age = Date.now() - Date.parse(completedAt);
            const ttl = (args.ttlHours ?? 20) * 3600_000;
            if (Number.isFinite(age) && age < ttl) return false;
          }
        } else {
          // In-progress claim without completion — allow reclaim after short stale window (45m)
          const claimedAt = data.claimedAt as string | undefined;
          if (claimedAt) {
            const age = Date.now() - Date.parse(claimedAt);
            const staleMs = 45 * 60_000;
            if (Number.isFinite(age) && age < staleMs && status === 'running') return false;
          }
        }
      }
      tx.set(ref, {
        slotKey: args.slotKey,
        status: 'running',
        claimedAt: new Date().toISOString(),
        completedAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
      return true;
    });
    return ok;
  } catch {
    return false;
  }
}

/** Mark cron slot succeeded so the same day/week is not re-run until TTL. */
export async function completeOpportunityCronSlot(args: {
  slotKey: string;
  status: 'succeeded' | 'failed';
  detail?: string;
}): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  await db.collection(OPP_COL.scans).doc(`cron:${args.slotKey}`).set(
    {
      status: args.status,
      completedAt: new Date().toISOString(),
      detail: args.detail || null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/** Release lease after failure so the next cron tick can retry. */
export async function releaseOpportunityCronSlot(slotKey: string): Promise<void> {
  await completeOpportunityCronSlot({ slotKey, status: 'failed', detail: 'released_for_retry' });
}

/** Last successful apply timestamp for a URL (cooldown). */
export async function getUrlLastAppliedAt(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const db = getAdminDb();
  if (!db) return null;
  const id = createHash('sha256').update(url.toLowerCase()).digest('hex').slice(0, 32);
  const snap = await db.collection(OPP_COL.urlCooldown).doc(id).get();
  if (!snap.exists) return null;
  const at = snap.data()?.lastAppliedAt;
  return typeof at === 'string' ? at : null;
}

export async function setUrlLastAppliedAt(args: {
  url: string;
  appliedAt: string;
  opportunityId: string;
}): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  const id = createHash('sha256').update(args.url.toLowerCase()).digest('hex').slice(0, 32);
  await db.collection(OPP_COL.urlCooldown).doc(id).set(
    {
      url: args.url,
      lastAppliedAt: args.appliedAt,
      opportunityId: args.opportunityId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Claim an idempotency key for a write. Returns false if already applied.
 */
export async function claimIdempotencyKey(args: {
  key: string;
  opportunityId: string;
}): Promise<boolean> {
  const db = getAdminDb();
  if (!db) return true;
  const ref = db.collection(OPP_COL.idempotency).doc(args.key);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data()?.status === 'applied') return false;
      tx.set(ref, {
        key: args.key,
        opportunityId: args.opportunityId,
        status: 'claimed',
        claimedAt: new Date().toISOString(),
        createdAt: FieldValue.serverTimestamp(),
      });
      return true;
    });
  } catch {
    return false;
  }
}

export async function completeIdempotencyKey(args: {
  key: string;
  status: 'applied' | 'failed';
}): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  await db.collection(OPP_COL.idempotency).doc(args.key).set(
    {
      status: args.status,
      completedAt: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      out[k] = stripUndefined(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
