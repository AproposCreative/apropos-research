import { createHash, randomUUID } from 'node:crypto';
import { Resend } from 'resend';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { EDITORIAL_EMAILS, normalizeAccessEmail } from '@/lib/auth-policy';

export type AuthMailKind = 'verify' | 'reset';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const DAY = 86400000;

/** Durable limits across instances: one/minute, six/day/address, thirty/day globally. */
export async function reserveAuthMail(kind: AuthMailKind, email: string): Promise<string | null> {
  const db = getAdminDb(); if (!db) throw new Error('auth_mail_storage_unavailable');
  const address = db.collection('authMailLimits').doc(hash(`${kind}:${email}`));
  const global = db.collection('authMailLimits').doc('global');
  return db.runTransaction(async tx => {
    const [a, g] = await Promise.all([tx.get(address), tx.get(global)]);
    const now = Date.now();
    const recent = (d: any): number[] => Array.isArray(d?.times) ? d.times.filter((v: unknown) => typeof v === 'number' && now - v < DAY) : [];
    const times = recent(a.data()); const all = recent(g.data());
    if (times.some(t => now - t < 60000) || times.length >= 6 || all.length >= 30) return null;
    const operationId = randomUUID();
    tx.set(address, { times: [...times, now], updatedAt: now });
    tx.set(global, { times: [...all, now], updatedAt: now });
    return operationId;
  });
}

/** Never changes emailVerified or returns action links to callers. */
export async function sendAuthMail(kind: AuthMailKind, rawEmail: string) {
  const email = normalizeAccessEmail(rawEmail);
  if (!email || !EDITORIAL_EMAILS.some(e => e === email)) return;
  const auth = getAdminAuth(); const db = getAdminDb();
  const key = process.env.RESEND_API_KEY; const from = process.env.RESEND_FROM_EMAIL;
  if (!auth || !db || !key || !from) throw new Error('auth_mail_configuration_missing');
  const operationId = await reserveAuthMail(kind, email); if (!operationId) return;
  const audit = db.collection('authMailOperations').doc(operationId);
  // No action links, raw email addresses or credentials in audit records.
  await audit.set({ kind, recipientHash: hash(email), status: 'started', createdAt: new Date().toISOString() });
  try {
    const user = await auth.getUserByEmail(email);
    const access = (await db.collection('editorialAccess').doc(email).get()).data();
    if (user.disabled || access?.active === false || (kind === 'verify' && user.emailVerified)) {
      await audit.update({ status: 'skipped' }); return;
    }
    const settings = { url: 'https://ai.aproposmagazine.com/ai', handleCodeInApp: false };
    const link = kind === 'verify' ? await auth.generateEmailVerificationLink(email, settings) : await auth.generatePasswordResetLink(email, settings);
    const subject = kind === 'verify' ? 'Bekræft din mail til Apropos AI' : 'Vælg en ny adgangskode til Apropos AI';
    const instruction = kind === 'verify' ? 'Bekræft din mail via dette sikre Firebase-link:' : 'Vælg din nye adgangskode via dette sikre Firebase-link:';
    const result = await new Resend(key).emails.send({ from, to: email, subject,
      text: `${instruction}\n\n${link}\n\nGå derefter tilbage til https://ai.aproposmagazine.com.\n\nHar du ikke bedt om denne mail, kan du ignorere den.\n\nApropos Magazine`,
    }, { idempotencyKey: `auth-mail-${operationId}` });
    if (result.error || !result.data?.id) throw new Error('auth_mail_provider_rejected');
    await audit.update({ status: 'accepted', providerId: result.data.id });
  } catch (error) {
    const missing = (error as { code?: string }).code === 'auth/user-not-found';
    await audit.update({ status: missing ? 'skipped' : 'failed' });
    if (!missing) throw new Error('auth_mail_send_failed');
  }
}
