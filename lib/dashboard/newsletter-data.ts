import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import type { RecipientResult } from '@/lib/newsletter/get-recipients';
import { readNewsletterMessages, readNewsletterTracking, type NewsletterMessage, type NewsletterTracking } from '@/lib/newsletter/engagement';
import { dashboardDateRange, type DashboardPeriod } from './period';
export type NewsletterAudienceRow = { email: string; signedUpAt: string | null; active: boolean | null; unsubscribedAt?: string | null };
export type NewsletterCampaign = { id: string; subject: string; sentAt: string; sendType: string; audienceKnown: boolean;
  recipients: number; delivered: number; opened: number | null; clicked: number | null; failed: number;
  messages: Array<{ email: string; status: string; opened: boolean | null; clicked: boolean | null }> };
export type NewsletterDashboard = {
  audience: NewsletterAudienceRow[]; newSubscribers: number | null; unknownSignupDates: number;
  campaigns: NewsletterCampaign[]; tracking: NewsletterTracking | null; truncated: boolean; historyNote: string | null;
};
function observable(message: NewsletterMessage, kind: 'opened' | 'clicked', tracking: NewsletterTracking | null) {
  if (message.signals[kind]) return true;
  const since = kind === 'opened' ? tracking?.openTrackingSince : tracking?.clickTrackingSince;
  const enabled = kind === 'opened' ? tracking?.openTracking : tracking?.clickTracking;
  return enabled && since && message.sentAt >= since ? false : null;
}
export function buildNewsletterCampaigns(messages: NewsletterMessage[], tracking: NewsletterTracking | null): NewsletterCampaign[] {
  const groups = new Map<string, { rows: NewsletterMessage[]; campaign: NewsletterCampaign }>();
  // Count unique provider-message identities, never the number of webhook events.
  for (const message of new Map(messages.map(row => [row.id, row])).values()) {
    if (message.isTest) continue;
    const key = JSON.stringify([message.campaign, message.sendType, message.subject]);
    let group = groups.get(key);
    if (!group) {
      group = { rows: [], campaign: { id: createHash('sha256').update(key).digest('hex'), subject: message.subject,
        sentAt: message.sentAt, sendType: message.sendType, audienceKnown: message.testClassification === 'explicit',
        recipients: 0, delivered: 0, opened: null, clicked: null, failed: 0, messages: [] } };
      groups.set(key, group);
    }
    group.rows.push(message);
  }
  return [...groups.values()].map(({ rows, campaign }) => {
    campaign.sentAt = rows.reduce((latest, row) => row.sentAt > latest ? row.sentAt : latest, campaign.sentAt);
    campaign.recipients = rows.length;
    campaign.delivered = rows.filter(row => !!row.signals.delivered).length;
    campaign.failed = rows.filter(row => row.signals.bounced || row.signals.failed || row.signals.suppressed).length;
    const opens = rows.map(row => observable(row, 'opened', tracking)), clicks = rows.map(row => observable(row, 'clicked', tracking));
    campaign.opened = opens.every(value => value !== null) ? opens.filter(Boolean).length : opens.some(Boolean) ? opens.filter(Boolean).length : null;
    campaign.clicked = clicks.every(value => value !== null) ? clicks.filter(Boolean).length : clicks.some(Boolean) ? clicks.filter(Boolean).length : null;
    campaign.messages = rows.map(row => ({ email: row.recipient,
      status: row.signals.complained ? 'complained' : row.signals.bounced ? 'bounced' : row.signals.failed || row.signals.suppressed ? 'failed' : row.signals.clicked ? 'clicked' : row.signals.opened ? 'opened' : row.signals.delivered ? 'delivered' : row.signals.sent ? 'sent' : 'unknown',
      opened: observable(row, 'opened', tracking), clicked: observable(row, 'clicked', tracking) }));
    return campaign;
  }).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}
export async function fetchNewsletterDashboard(period: DashboardPeriod, recipients: RecipientResult): Promise<NewsletterDashboard> {
  const db = getAdminDb(); if (!db) throw Error('newsletter_analytics_storage_unavailable');
  const range = dashboardDateRange(period);
  const [messageData, tracking, unsubscribed] = await Promise.all([
    readNewsletterMessages(range.startIso, range.endIso), readNewsletterTracking(), db.collection('newsletter_unsubscribes').get(),
  ]);
  const audience = new Map<string, NewsletterAudienceRow>((recipients.subscribers ?? recipients.emails.map(email => ({ email, active: true, signedUpAt: null }))).map(row => [row.email, row] as const));
  for (const doc of unsubscribed.docs) {
    const row = doc.data(), email = String(row.email ?? doc.id).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const current = audience.get(email);
    audience.set(email, { email, signedUpAt: current?.signedUpAt ?? null, active: false,
      unsubscribedAt: typeof row.unsubscribedAt === 'string' ? row.unsubscribedAt : null });
  }
  const rows = [...audience.values()].sort((a, b) => (b.signedUpAt ?? '').localeCompare(a.signedUpAt ?? '') || a.email.localeCompare(b.email));
  return { audience: rows, newSubscribers: rows.some(row => row.signedUpAt) ? rows.filter(row => row.signedUpAt && row.signedUpAt >= range.startIso && row.signedUpAt <= range.endIso).length : null,
    unknownSignupDates: rows.filter(row => !row.signedUpAt).length,
    campaigns: buildNewsletterCampaigns(messageData.messages, tracking), tracking, truncated: messageData.truncated,
    historyNote: tracking?.historyComplete === false ? 'Den bevarede mailhistorik er ufuldstændig.' : tracking?.historyFrom && tracking.historyFrom > range.startIso ? 'Mailhistorikken dækker kun en del af den valgte periode.' : !tracking?.historyFrom ? 'Historik opsamles fra den nye måling. Ældre hændelser kan mangle.' : null };
}
