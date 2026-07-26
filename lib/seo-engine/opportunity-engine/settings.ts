/**
 * Automatic opportunity optimization settings.
 *
 * Production default = ON when settings are readable and not emergency-stopped.
 * Fail-closed: Firestore/settings read failures → auto OFF (never fall back to enabled).
 * Env:
 *   SEO_ENGINE_AUTO_OPPORTUNITY_OPT=false  → force off (kill-switch)
 *   SEO_ENGINE_AUTO_OPPORTUNITY_OPT=true   → force on (ops override)
 *   unset                                  → ON only after successful settings read with no stop
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { assessOpportunityConnections } from '@/lib/seo-engine/opportunity-engine/connections';

const SETTINGS_DOC = 'seoEngine';

/**
 * Pure env parse — used by tests.
 * - "false" → disabled
 * - "true" → enabled
 * - unset/other → default enabled (only applied after successful settings read)
 */
export function parseAutoOpportunityOptEnv(
  raw: string | undefined
): { explicit: boolean; enabled: boolean } {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'off') {
    return { explicit: true, enabled: false };
  }
  if (v === 'true' || v === '1' || v === 'on') {
    return { explicit: true, enabled: true };
  }
  return { explicit: false, enabled: true };
}

/** Env-only view (true unless explicitly false). Not sufficient alone for production auto. */
export function isAutoOpportunityOptimizationEnabledFromEnv(): boolean {
  return parseAutoOpportunityOptEnv(process.env.SEO_ENGINE_AUTO_OPPORTUNITY_OPT).enabled;
}

/**
 * Resolve whether automatic optimization is allowed by kill-switch.
 * Fail-closed on Firestore unavailability or read errors.
 */
export async function resolveAutoOpportunityOptimizationEnabled(): Promise<boolean> {
  const envParsed = parseAutoOpportunityOptEnv(process.env.SEO_ENGINE_AUTO_OPPORTUNITY_OPT);
  // Explicit env false always wins (ops kill-switch without Firestore)
  if (envParsed.explicit && !envParsed.enabled) return false;
  // Explicit env true forces on even if Firestore is down (ops override)
  if (envParsed.explicit && envParsed.enabled) return true;

  const db = getAdminDb();
  if (!db) {
    // Cannot verify emergency-stop state → fail closed
    return false;
  }

  try {
    const snap = await db.collection('appSettings').doc(SETTINGS_DOC).get();
    if (snap.exists && typeof snap.data()?.autoOpportunityOptEnabled === 'boolean') {
      return snap.data()!.autoOpportunityOptEnabled as boolean;
    }
    // Successful read, no emergency stop stored → production default ON
    return true;
  } catch {
    // Settings read failed → fail closed (do NOT fall back to enabled)
    return false;
  }
}

/** Emergency stop / re-enable (admin UI). */
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

export type AutomaticOpportunityRuntime = {
  /** Kill-switch allows auto (default ON). */
  killSwitchEnabled: boolean;
  /** Connections allow optimize writes. */
  connectionsHealthyForOptimize: boolean;
  /** Connections allow empty SEO fill on publish. */
  canAutoFillOnPublish: boolean;
  /** True when auto apply/optimize should run. */
  shouldAutoOptimize: boolean;
  /** True when publish-path empty fill should enqueue. */
  shouldAutoFillOnPublish: boolean;
  connectionSummary: string;
};

/**
 * Combined runtime gate: kill-switch + connection health.
 */
export async function resolveAutomaticOpportunityRuntime(deps?: {
  resolveEnabled?: () => Promise<boolean>;
  assessConnections?: typeof assessOpportunityConnections;
}): Promise<AutomaticOpportunityRuntime> {
  const killSwitchEnabled = await (deps?.resolveEnabled || resolveAutoOpportunityOptimizationEnabled)();
  const health = await (deps?.assessConnections || assessOpportunityConnections)();
  return {
    killSwitchEnabled,
    connectionsHealthyForOptimize: health.canAutoOptimize,
    canAutoFillOnPublish: health.canAutoFillOnPublish,
    shouldAutoOptimize: killSwitchEnabled && health.canAutoOptimize,
    shouldAutoFillOnPublish: killSwitchEnabled && health.canAutoFillOnPublish,
    connectionSummary: health.summary,
  };
}
