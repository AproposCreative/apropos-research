import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { signupDate } from './signup-details';
export const NEWSLETTER_MESSAGES = 'newsletterAnalyticsMessages';
export const NEWSLETTER_EVENTS = 'newsletterAnalyticsEvents';
export type MailSignal = 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'failed' | 'suppressed';
export type NewsletterMessage = {
  id: string; recipient: string; subject: string; sentAt: string; campaign: string;
  sendType: string; isTest: boolean; testClassification: 'explicit' | 'unknown';
  signals: Partial<Record<MailSignal, { at: string | null; source: 'webhook' | 'send' | 'provider_snapshot' }>>;
  snapshotStatus?: string; snapshotAt?: string;
};
export type NewsletterTracking = { openTracking: boolean; clickTracking: boolean; observedAt: string;
  openTrackingSince?: string; clickTrackingSince?: string; historyFrom?: string; historyComplete?: boolean };
export function newsletterTags(tags: unknown): Record<string, string> {
  if (!tags || typeof tags !== 'object') return {};
  const values = Array.isArray(tags) ? tags.map(t => [t?.name, t?.value]) : Object.entries(tags);
  return Object.fromEntries(values.filter(([key, value]) => typeof key === 'string' && typeof value === 'string'));
}
export function newsletterMessage(input: { id: string; to: unknown; subject: unknown; createdAt: unknown; tags?: unknown }): NewsletterMessage | null {
  const tags = newsletterTags(input.tags);
  if (tags.channel !== 'newsletter' || !/^[a-zA-Z0-9_-]{1,150}$/.test(input.id)) return null;
  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  // Existing delivery sends one personalized email per recipient. Never assign
  // a shared multi-recipient open/click to a specific person.
  if (recipients.length !== 1 || typeof recipients[0] !== 'string') return null;
  const recipient = recipients[0].trim().toLowerCase();
  const sentAt = signupDate(input.createdAt);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || !sentAt) return null;
  const sendType = tags.send_type || 'manual_unknown';
  return { id: input.id, recipient, subject: typeof input.subject === 'string' ? input.subject.slice(0, 500) : '', sentAt,
    campaign: (tags.campaign || tags.job_id || tags.week_key || input.id).slice(0, 150), sendType,
    isTest: sendType === 'manual_test', testClassification: tags.send_type ? 'explicit' : 'unknown', signals: {} };
}
function database() { const db = getAdminDb(); if (!db) throw Error('newsletter_analytics_storage_unavailable'); return db; }
/** Call only after Svix verification. Ignore unrelated/received mail and store no
 * email bodies, attachment contents, IP addresses, user agents or tracking URLs. */
export async function recordNewsletterEvent(eventId: string, type: string, createdAt: unknown, data: Record<string, unknown>) {
  const signal = type.replace(/^email\./, '') as MailSignal;
  if (!['sent','delivered','opened','clicked','bounced','complained','failed','suppressed'].includes(signal)) return false;
  const row = newsletterMessage({ id: String(data.email_id ?? ''), to: data.to, subject: data.subject, createdAt: data.created_at, tags: data.tags });
  if (!row) return false;
  const eventAt = signupDate(createdAt);
  if (!eventAt) return false;
  const db = database(), ref = db.collection(NEWSLETTER_MESSAGES).doc(row.id);
  const receipt = db.collection(NEWSLETTER_EVENTS).doc(createHash('sha256').update(eventId).digest('hex'));
  return db.runTransaction(async tx => {
    const [prior, event] = await Promise.all([tx.get(ref), tx.get(receipt)]);
    if (event.exists) return false;
    const old = prior.data() as NewsletterMessage | undefined;
    const signals = { ...old?.signals };
    // Keep every independently observed stage and its first event time. A click
    // neither invents an open nor overwrites a later delivered/open signal.
    if (!signals[signal]?.at || eventAt < signals[signal]!.at!) signals[signal] = { at: eventAt, source: 'webhook' };
    tx.set(ref, { ...row, ...old, signals });
    tx.create(receipt, { messageId: row.id, type, eventAt });
    return true;
  });
}
/** An API last_event snapshot only proves that event, with no event timestamp.
 * Preserve earlier independent events and never infer opens from clicks. */
export async function recordNewsletterProviderSnapshot(raw: Record<string, unknown>) {
  const row = newsletterMessage({ id: String(raw.id ?? ''), to: raw.to, subject: raw.subject, createdAt: raw.created_at, tags: raw.tags });
  if (!row) return false;
  const state = String(raw.last_event ?? '') as MailSignal, at = new Date().toISOString();
  const db = database(), ref = db.collection(NEWSLETTER_MESSAGES).doc(row.id);
  await db.runTransaction(async tx => {
    const old = (await tx.get(ref)).data() as NewsletterMessage | undefined;
    const signals = { ...old?.signals };
    if (['sent','delivered','opened','clicked','bounced','complained','failed','suppressed'].includes(state) && !signals[state]) signals[state] = { at: null, source: 'provider_snapshot' };
    tx.set(ref, { ...row, ...old, signals, snapshotStatus: state, snapshotAt: at });
  });
  return true;
}
export async function readNewsletterTracking(): Promise<NewsletterTracking | null> {
  return (await database().collection('newsletterAnalyticsConfig').doc('tracking').get()).data() as NewsletterTracking | undefined ?? null;
}
export async function readNewsletterMessages(start: string, end: string) {
  const result = await database().collection(NEWSLETTER_MESSAGES).where('sentAt','>=',start).where('sentAt','<=',end).orderBy('sentAt','desc').limit(2001).get();
  return { messages: result.docs.slice(0, 2000).map(doc => doc.data() as NewsletterMessage), truncated: result.size > 2000 };
}
