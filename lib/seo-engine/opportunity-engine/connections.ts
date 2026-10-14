/**
 * Connection health for automatic opportunity drift.
 * Fail closed when GSC/Webflow are unhealthy — never invent mock data.
 */

import { probeGa4DataAccess } from '@/lib/ga4/data-client';
import { getGa4PropertyResourceName } from '@/lib/ga4/property';
import { getConfiguredGscSiteUrl, getGscAccessToken } from '@/lib/gsc/google-auth';
import { defaultGscFetch } from '@/lib/seo-engine/search-signals';
import { buildGscCompareWindows } from './gsc-windows';
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
    const token = await getGscAccessToken(), period = buildGscCompareWindows();
    const result = await defaultGscFetch({ siteUrl: getConfiguredGscSiteUrl()!, token,
      body: { startDate: period.currentStart, endDate: period.currentEnd, rowLimit: 1 } });
    return result.ok === false ? { ok: false, message: `Search Console-dataadgang kunne ikke verificeres (HTTP ${result.status})` }
      : { ok: true, message: 'Search Console-dataadgang verificeret' };
  } catch {
    return { ok: false, message: 'Search Console-dataadgang kunne ikke verificeres' };
  }
}

async function defaultProbeGa4(): Promise<{ ok: boolean; message: string }> {
  if (!getGa4PropertyResourceName()) {
    return { ok: false, message: 'GA4_PROPERTY_ID mangler' };
  }
  try {
    const result = await probeGa4DataAccess();
    return { ok: result.ok, message: result.ok ? 'Analytics-dataadgang verificeret' : 'Analytics-dataadgang kunne ikke verificeres' };
  } catch {
    return { ok: false, message: 'Analytics-dataadgang kunne ikke verificeres' };
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
    summary = 'Google-dataadgang verificeret; Webflow-konfiguration findes. Kø, redaktionelle kontroller og processorvalg afgør, hvad der udføres.';
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
