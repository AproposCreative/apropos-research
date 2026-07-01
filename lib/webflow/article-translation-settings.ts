/**
 * Runtime-indstilling for auto-oversættelse (Firestore override af env).
 */

import { FieldValue } from 'firebase-admin/firestore';
import { env } from '@/lib/config/env';
import { getAdminDb } from '@/lib/firebase-admin';

const SETTINGS_DOC = 'articleTranslation';

export async function resolveAutoTranslateEnabled(): Promise<boolean> {
  const db = getAdminDb();
  if (db) {
    try {
      const snap = await db.collection('appSettings').doc(SETTINGS_DOC).get();
      if (snap.exists && typeof snap.data()?.autoTranslateEn === 'boolean') {
        return snap.data()!.autoTranslateEn;
      }
    } catch {
      /* fallback til env */
    }
  }
  return env.WEBFLOW_AUTO_TRANSLATE_EN === 'true';
}

export async function setAutoTranslateEnabled(enabled: boolean): Promise<void> {
  const db = getAdminDb();
  if (!db) {
    throw new Error('Firestore er ikke tilgængelig — kan ikke gemme indstilling.');
  }
  await db.collection('appSettings').doc(SETTINGS_DOC).set(
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
