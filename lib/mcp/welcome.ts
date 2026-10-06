import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { activeMember } from './oauth';
import { mcpWelcomeContent } from './welcome-content';

const collection = () => {
  const db = getAdminDb(); if (!db) throw Error('mcp_welcome_store_unavailable');
  return { db, rows: db.collection('mcpWelcomeMail') };
};
const WINDOW = 23 * 3600000; // Resend's 24h dedup window, with a safety margin.
const MAX_ATTEMPTS = 5;
type Payload = { from: string; to: string; subject: string; text: string; html: string };
export type McpWelcomeJob = {
  uid: string; grantId: string; authenticatedAt: number; version: string; createdAt: number;
  pending: boolean; status: 'queued' | 'sending' | 'accepted' | 'cancelled' | 'needs_reconciliation';
  attempts: number; nextAt: number; leaseUntil: number; firstAttemptAt?: number;
  payload?: Payload; providerId?: string; acceptedAt?: number; lastError?: string;
};

/** Only dispatches an existing outbox entry created atomically with the first OAuth grant.
 * Never creates entries for existing users, token refresh, failed or denied activation. */
export async function deliverMcpWelcome(uid: string, now = Date.now()) {
  const { db, rows } = collection(), ref = rows.doc(uid);
  const initial = (await ref.get()).data() as McpWelcomeJob | undefined;
  if (!initial?.pending || initial.nextAt > now || initial.leaseUntil > now) return { status: 'unchanged' };
  const auth = getAdminAuth();
  const key = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from || !auth) return { status: 'configuration_missing' };
  const member = await activeMember(uid, initial.authenticatedAt);
  // Fail closed without treating a temporary auth/service read failure as revocation.
  if (!member) return { status: 'access_unconfirmed' };
  const user = await auth.getUser(uid);
  const email = user.email?.trim().toLowerCase();
  if (!email || !user.emailVerified || user.disabled || !email.endsWith('@aproposmagazine.com')) return { status: 'access_unconfirmed' };
  const claim = await db.runTransaction(async tx => {
    const [snap, grantSnap] = await Promise.all([tx.get(ref), tx.get(db.collection('mcpGrants').doc(initial.grantId))]);
    const old = snap.data() as McpWelcomeJob | undefined, grant = grantSnap.data();
    if (!old?.pending || old.nextAt > now || old.leaseUntil > now) return null;
    if (!grant || grant.uid !== uid || grant.revoked || grant.expiresAt < now || (old.payload && old.payload.to !== email)) {
      tx.update(ref, { pending: false, status: 'cancelled', lastError: 'connection_or_recipient_changed' }); return null;
    }
    if (old.attempts >= MAX_ATTEMPTS || (old.firstAttemptAt != null && now - old.firstAttemptAt >= WINDOW)) {
      tx.update(ref, { pending: false, status: 'needs_reconciliation', lastError: 'send_outcome_unconfirmed' }); return null;
    }
    const payload = old.payload || { from, to: email, ...mcpWelcomeContent() };
    const job: McpWelcomeJob = { ...old, payload, status: 'sending', attempts: old.attempts + 1,
      firstAttemptAt: old.firstAttemptAt ?? now, leaseUntil: now + 120000, nextAt: now + 120000 };
    tx.set(ref, job); return job;
  });
  if (!claim) return { status: 'unchanged' };
  try {
    const recipientKey = createHash('sha256').update(uid).digest('hex');
    // Installed SDK forwards request options to fetch (its public type omits signal).
    const requestOptions = {
      idempotencyKey: `mcp-welcome-${recipientKey}`, signal: AbortSignal.timeout(8000),
    };
    const result = await new Resend(key).emails.send(claim.payload!, requestOptions);
    if (result.error || !result.data?.id) throw Error('send_unconfirmed');
    await ref.update({ status: 'accepted', pending: false, providerId: result.data.id, acceptedAt: now, leaseUntil: 0 });
    // Provider acceptance is not proof of inbox delivery.
    return { status: 'accepted' };
  } catch {
    await ref.update({ lastError: 'send_outcome_unconfirmed', nextAt: now + 5 * 60000, leaseUntil: 0 });
    return { status: 'unconfirmed' };
  }
}

export async function dispatchMcpWelcomes() {
  const { rows } = collection();
  const candidates = await rows.where('pending', '==', true).limit(20).get();
  const results: string[] = [];
  for (const doc of candidates.docs) {
    if (results.length >= 5) break;
    const row = doc.data() as McpWelcomeJob;
    if (row.nextAt > Date.now() || row.leaseUntil > Date.now()) continue;
    try { results.push((await deliverMcpWelcome(doc.id)).status); }
    catch { results.push('unconfirmed'); }
  }
  return { processed: results.length, results };
}
