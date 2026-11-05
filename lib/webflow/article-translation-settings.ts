import { FieldValue } from 'firebase-admin/firestore';
import { env } from '@/lib/config/env';
import { getAdminDb } from '@/lib/firebase-admin';

export const articleTranslationSettingsRef = (db: NonNullable<ReturnType<typeof getAdminDb>>) =>
  db.collection('appSettings').doc('articleTranslation');

export async function resolveAutoTranslateEnabled(): Promise<boolean> {
  const db = getAdminDb();
  if (!db) throw new Error('Oversættelsesindstillingen kunne ikke læses.');
  return (await articleTranslationSettingsRef(db).get()).data()?.autoTranslateEn === true;
}

export async function setAutoTranslateEnabled(enabled: boolean): Promise<void> {
  const db = getAdminDb();
  if (!db) {
    throw new Error('Firestore er ikke tilgængelig — kan ikke gemme indstilling.');
  }
  await articleTranslationSettingsRef(db).set(
    {
      autoTranslateEn: enabled,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/** Synk fallback (env) — brug resolveAutoTranslateEnabled i webhook/async flows. */
export function isArticleAutoTranslateEnabledFromEnv(): boolean {
  return env.WEBFLOW_AUTO_TRANSLATE_EN === 'true';
}
