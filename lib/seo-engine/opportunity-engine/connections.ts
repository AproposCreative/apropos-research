/**
 * Connection health for automatic opportunity drift.
 * Fail closed when GSC/Webflow are unhealthy — never invent mock data.
 */

import { getGa4AccessToken } from '@/lib/ga4/google-auth';
import { getGa4PropertyResourceName } from '@/lib/ga4/property';
import { getConfiguredGscSiteUrl, getGscAccessToken } from '@/lib/gsc/google-auth';
import { env } from '@/lib/config/env';

export type OpportunityConnectionHealth = {
  healthy: boolean;
  /** True when GSC + Webflow are ready for automatic optimize writes. */
  canAutoOptimize: boolean;
  /** True when Webflow alone is ready for empty SEO fill on publish. */
  canAutoFillOnPublish: boolean;
  gsc: { ok: boolean; message: string };
  ga4: { ok: boolean; message: string };
  webflow: { ok: boolean; message: string };
  summary: string;
};

export type ConnectionProbeDeps = {
  probeGsc?: () => Promise<{ ok: boolean; message: string }>;
  probeGa4?: () => Promise<{ ok: boolean; message: string }>;
  probeWebflow?: () => Promise<{ ok: boolean; message: string }>;
};

async function defaultProbeGsc(): Promise<{ ok: boolean; message: string }> {
  if (!getConfiguredGscSiteUrl()) {
    return { ok: false, message: 'GSC_SITE_URL mangler' };
  }
  try {
    await getGscAccessToken();
    return { ok: true, message: 'GSC auth OK' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'GSC auth failed' };
  }
}

async function defaultProbeGa4(): Promise<{ ok: boolean; message: string }> {
  if (!getGa4PropertyResourceName()) {
    return { ok: false, message: 'GA4_PROPERTY_ID mangler' };
  }
  try {
    await getGa4AccessToken();
    return { ok: true, message: 'GA4 auth OK' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'GA4 auth failed' };
  }
}

async function defaultProbeWebflow(): Promise<{ ok: boolean; message: string }> {
  const token = env.WEBFLOW_API_TOKEN?.trim();
  const collection =
    env.WEBFLOW_ARTICLES_COLLECTION_ID?.trim() ||
    process.env.WEBFLOW_ARTICLES_COLLECTION_ID?.trim();
  if (!token) return { ok: false, message: 'WEBFLOW_API_TOKEN mangler' };
  if (!collection) return { ok: false, message: 'WEBFLOW_ARTICLES_COLLECTION_ID mangler' };
  return { ok: true, message: 'Webflow credentials present' };
}

/**
 * Assess whether automatic optimization may run.
 * GSC + Webflow required for optimize; GA4 preferred (partial without GA4).
 */
export async function assessOpportunityConnections(
  deps: ConnectionProbeDeps = {}
): Promise<OpportunityConnectionHealth> {
  const [gsc, ga4, webflow] = await Promise.all([
    (deps.probeGsc || defaultProbeGsc)(),
    (deps.probeGa4 || defaultProbeGa4)(),
    (deps.probeWebflow || defaultProbeWebflow)(),
  ]);

  const canAutoFillOnPublish = webflow.ok;
  // Optimize requires GSC evidence + Webflow write path. GA4 strengthens confidence but is not hard-required.
  const canAutoOptimize = gsc.ok && webflow.ok;
  const healthy = canAutoOptimize && ga4.ok;

  let summary: string;
  if (healthy) {
    summary = 'GSC, GA4 og Webflow er sunde — automatisk drift aktiv (medmindre nød-stop).';
  } else if (canAutoOptimize) {
    summary = `GSC+Webflow OK — auto-optimize mulig. GA4: ${ga4.message}`;
  } else if (canAutoFillOnPublish && !gsc.ok) {
    summary = `Webflow OK til tom SEO-fill ved publish. GSC utilgængelig: ${gsc.message}`;
  } else {
    summary = `Automatisk drift blokeret — GSC: ${gsc.message}; Webflow: ${webflow.message}`;
  }

  return {
    healthy,
    canAutoOptimize,
    canAutoFillOnPublish,
    gsc,
    ga4,
    webflow,
    summary,
  };
}
