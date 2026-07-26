/**
 * Auto-optimering for opportunity engine (safe metadata only).
 * Separate from Auto-SEO empty-fill (`autoSeoEnabled`).
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';

const SETTINGS_DOC = 'seoEngine';

export function isAutoOpportunityOptimizationEnabledFromEnv(): boolean {
  return process.env.SEO_ENGINE_AUTO_OPPORTUNITY_OPT === 'true';
}

export async function resolveAutoOpportunityOptimizationEnabled(): Promise<boolean> {
  const db = getAdminDb();
  if (db) {
    try {
      const snap = await db.collection('appSettings').doc(SETTINGS_DOC).get();
      if (snap.exists && typeof snap.data()?.autoOpportunityOptEnabled === 'boolean') {
        return snap.data()!.autoOpportunityOptEnabled as boolean;
      }
    } catch {
      /* env fallback */
    }
  }
  return isAutoOpportunityOptimizationEnabledFromEnv();
}

export async function setAutoOpportunityOptimizationEnabled(enabled: boolean): Promise<void> {
  const db = getAdminDb();
  if (!db) {
    throw new Error('Firestore er ikke tilgængelig — kan ikke gemme indstilling.');
  }
  await db.collection('appSettings').doc(SETTINGS_DOC).set(
    {
      autoOpportunityOptEnabled: enabled,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
