import { getAdminDb } from '@/lib/firebase-admin';
import { readDeliveryState } from '@/lib/liv/delivery-store';
import { deliveryHealth } from '@/lib/liv/delivery-policy';
import { readSharedCostSummary } from '@/lib/liv/cost-ledger';
import { getCopenhagenIsoWeekKey } from '@/lib/newsletter/copenhagen-time';
import { DEFAULT_WEEKLY_AUTO_SETTINGS, WEEKLY_AUTO_SETTINGS_COLLECTION, WEEKLY_AUTO_SETTINGS_DOC_ID } from '@/lib/newsletter/weekly-auto-settings';
import { WEEKLY_SEND_COLLECTION, weeklyAutoDocId } from '@/lib/newsletter/weekly-send-history';

const count = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;

/** Reads only: never call a cron handler, recipient loader or draft generator here. */
export async function readNewsletterOperations(now = new Date()) {
  const db = getAdminDb();
  if (!db) throw new Error('newsletter_status_unavailable');
  const week = getCopenhagenIsoWeekKey(now);
  const [settings, history] = await Promise.all([
    db.collection(WEEKLY_AUTO_SETTINGS_COLLECTION).doc(WEEKLY_AUTO_SETTINGS_DOC_ID).get(),
    db.collection(WEEKLY_SEND_COLLECTION).doc(weeklyAutoDocId(week)).get(),
  ]);
  const raw = settings.exists ? settings.data() : DEFAULT_WEEKLY_AUTO_SETTINGS;
  if (!raw || typeof raw.enabled !== 'boolean' ||
    !Number.isInteger(raw.weekdayIso) || raw.weekdayIso < 1 || raw.weekdayIso > 7 ||
    !Number.isInteger(raw.hour) || raw.hour < 0 || raw.hour > 23 ||
    !Number.isInteger(raw.minute) || raw.minute < 0 || raw.minute > 59) {
    throw new Error('newsletter_settings_invalid');
  }
  const sent = history.data();
  const status = !history.exists ? 'not_recorded' :
    ['processing', 'sent', 'failed', 'skipped'].includes(sent?.status) ? sent!.status as string : 'unknown';
  return {
    week, enabled: raw.enabled, schedule: { weekdayIso: raw.weekdayIso, hour: raw.hour, minute: raw.minute, timezone: 'Europe/Copenhagen' },
    settingsSource: settings.exists ? 'saved' : 'default', status,
    // Do not expose recipients, subject lines, raw errors or provider bodies.
    sentCount: count(sent?.sent), failedCount: count(sent?.failed),
  };
}

async function section<T>(read: () => Promise<T>) {
  try { return { available: true as const, data: await read() }; }
  catch { return { available: false as const, reason: 'status_unavailable' as const }; }
}

/** Each section fails independently; missing evidence must not become healthy. */
export async function readEditorialOperations(now = new Date()) {
  const [liv, newsletter, budget] = await Promise.all([
    section(async () => ({ ...deliveryHealth(await readDeliveryState(), now),
      autoPublishEnabled: process.env.LIV_DELIVERY_QUEUE_ENABLED === 'true' &&
        process.env.LIV_DAILY_PUBLICATION_MODE === 'auto_publish' &&
        !['1', 'true'].includes((process.env.LIV_DAILY_PAUSED || '').toLowerCase()) })),
    section(() => readNewsletterOperations(now)),
    section(readSharedCostSummary),
  ]);
  return { checkedAt: now.toISOString(), liv, newsletter, budget };
}
