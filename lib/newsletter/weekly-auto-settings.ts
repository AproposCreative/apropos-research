import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';

export const WEEKLY_AUTO_SETTINGS_COLLECTION = 'newsletterSettings';
export const WEEKLY_AUTO_SETTINGS_DOC_ID = 'weeklyAuto';

export type WeeklyAutoSettings = {
  enabled: boolean;
  /** ISO: 1 = mandag … 7 = søndag */
  weekdayIso: number;
  hour: number;
  minute: number;
};

export const DEFAULT_WEEKLY_AUTO_SETTINGS: WeeklyAutoSettings = {
  enabled: true,
  weekdayIso: 5,
  hour: 12,
  minute: 0,
};

function clampWeekday(n: number): number {
  if (!Number.isFinite(n) || n < 1 || n > 7) return DEFAULT_WEEKLY_AUTO_SETTINGS.weekdayIso;
  return Math.floor(n);
}

function clampHour(n: number): number {
  if (!Number.isFinite(n) || n < 0 || n > 23) return DEFAULT_WEEKLY_AUTO_SETTINGS.hour;
  return Math.floor(n);
}

function clampMinute(n: number): number {
  if (!Number.isFinite(n) || n < 0 || n > 59) return DEFAULT_WEEKLY_AUTO_SETTINGS.minute;
  return Math.floor(n);
}

function normalize(raw: Record<string, unknown> | undefined): WeeklyAutoSettings {
  if (!raw) return { ...DEFAULT_WEEKLY_AUTO_SETTINGS };
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_WEEKLY_AUTO_SETTINGS.enabled;
  return {
    enabled,
    weekdayIso: clampWeekday(Number(raw.weekdayIso)),
    hour: clampHour(Number(raw.hour)),
    minute: clampMinute(Number(raw.minute)),
  };
}

/**
 * Indstillinger for Vercel-cron auto-ugentligt brev (Europe/Copenhagen ugedag + klokkeslæt).
 * Manglende doc ⇒ samme adfærd som før (fredag 12:00, slået til).
 */
export async function getWeeklyAutoSettings(): Promise<WeeklyAutoSettings> {
  const db = getAdminDb();
  if (!db) return { ...DEFAULT_WEEKLY_AUTO_SETTINGS };
  try {
    const snap = await db.collection(WEEKLY_AUTO_SETTINGS_COLLECTION).doc(WEEKLY_AUTO_SETTINGS_DOC_ID).get();
    if (!snap.exists) return { ...DEFAULT_WEEKLY_AUTO_SETTINGS };
    return normalize(snap.data() as Record<string, unknown>);
  } catch (e) {
    console.warn('[newsletter/weekly-auto-settings] read failed, using defaults:', e);
    return { ...DEFAULT_WEEKLY_AUTO_SETTINGS };
  }
}

export async function saveWeeklyAutoSettings(input: WeeklyAutoSettings): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error('Firestore er ikke konfigureret');
  const s: WeeklyAutoSettings = {
    enabled: Boolean(input.enabled),
    weekdayIso: clampWeekday(input.weekdayIso),
    hour: clampHour(input.hour),
    minute: clampMinute(input.minute),
  };
  await db
    .collection(WEEKLY_AUTO_SETTINGS_COLLECTION)
    .doc(WEEKLY_AUTO_SETTINGS_DOC_ID)
    .set(
      {
        ...s,
        timezone: 'Europe/Copenhagen',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}
