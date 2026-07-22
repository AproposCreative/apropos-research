import { FieldValue } from 'firebase-admin/firestore';
import { env } from '@/lib/config/env';
import { getAdminDb } from '@/lib/firebase-admin';

const SETTINGS_DOC = 'seoEngine';

export function isAutoSeoEngineEnabledFromEnv(): boolean {
  return env.WEBFLOW_AUTO_SEO_ENGINE === 'true';
}

export async function resolveAutoSeoEngineEnabled(): Promise<boolean> {
  const db = getAdminDb();
  if (db) {
    try {
      const snap = await db.collection('appSettings').doc(SETTINGS_DOC).get();
      if (snap.exists && typeof snap.data()?.autoSeoEnabled === 'boolean') {
        return snap.data()!.autoSeoEnabled;
      }
    } catch {
      /* env fallback */
    }
  }
  return isAutoSeoEngineEnabledFromEnv();
}

export async function setAutoSeoEngineEnabled(enabled: boolean): Promise<void> {
  const db = getAdminDb();
  if (!db) {
    throw new Error('Firestore er ikke tilgængelig — kan ikke gemme indstilling.');
  }
  await db.collection('appSettings').doc(SETTINGS_DOC).set(
    {
      autoSeoEnabled: enabled,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
