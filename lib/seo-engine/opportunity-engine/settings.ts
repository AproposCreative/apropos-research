/**
 * Automatic opportunity optimization settings.
 *
 * Production default = ON (automatic drift) unless explicitly emergency-stopped.
 * Env:
 *   SEO_ENGINE_AUTO_OPPORTUNITY_OPT=false  → force off
 *   SEO_ENGINE_AUTO_OPPORTUNITY_OPT=true   → force on (even if Firestore unset)
 *   unset                                  → ON by default; Firestore can emergency-stop
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { assessOpportunityConnections } from '@/lib/seo-engine/opportunity-engine/connections';

const SETTINGS_DOC = 'seoEngine';

/**
 * Pure env parse — used by tests.
 * - "false" → disabled
 * - "true" → enabled
 * - unset/other → default enabled (automatic production drift)
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

/** Env-only default (true unless explicitly false). */
export function isAutoOpportunityOptimizationEnabledFromEnv(): boolean {
  return parseAutoOpportunityOptEnv(process.env.SEO_ENGINE_AUTO_OPPORTUNITY_OPT).enabled;
}

/**
 * Resolve whether automatic optimization is allowed by kill-switch.
 * Does NOT check connection health — use `resolveAutomaticOpportunityRuntime`.
 */
export async function resolveAutoOpportunityOptimizationEnabled(): Promise<boolean> {
  const envParsed = parseAutoOpportunityOptEnv(process.env.SEO_ENGINE_AUTO_OPPORTUNITY_OPT);
  // Explicit env false always wins (ops kill-switch without Firestore)
  if (envParsed.explicit && !envParsed.enabled) return false;

  const db = getAdminDb();
  if (db) {
    try {
      const snap = await db.collection('appSettings').doc(SETTINGS_DOC).get();
      if (snap.exists && typeof snap.data()?.autoOpportunityOptEnabled === 'boolean') {
        return snap.data()!.autoOpportunityOptEnabled as boolean;
      }
    } catch {
      /* env/default fallback */
    }
  }
  return envParsed.enabled;
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
