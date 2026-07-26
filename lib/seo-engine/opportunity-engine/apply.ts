/**
 * Apply / rollback for opportunity proposals.
 *
 * Automatic production path writes ONLY seo-title + meta-description (+ stores
 * server JSON-LD snapshot). Never editorial title/body/stance/rating/slug/dates.
 */

import {
  getMetaVersion,
  getOpportunity,
  saveMetaVersion,
  updateOpportunityStatus,
  appendAudit,
  getUrlLastAppliedAt,
  setUrlLastAppliedAt,
  claimIdempotencyKey,
  completeIdempotencyKey,
} from '@/lib/seo-engine/opportunity-engine/store';
import { resolveAutomaticOpportunityRuntime } from '@/lib/seo-engine/opportunity-engine/settings';
import {
  assertCmsPatchIsSafe,
  buildIdempotencyKey,
  detectStaleSeoWrite,
  evaluateAutoApplyGuardrails,
  OPPORTUNITY_MAX_APPLY_PER_RUN,
} from '@/lib/seo-engine/opportunity-engine/guardrails';
import { cmsLocaleIdFor } from '@/lib/seo-engine/opportunity-engine/locale';
import type {
  OpportunityProposal,
  OpportunitySafeField,
  SeoOpportunity,
} from '@/lib/seo-engine/opportunity-engine/types';
import { getCmsSeoSlugs, isCmsSeoFieldEmpty, toWebflowSeoPatch } from '@/lib/seo-engine/webflow-adapter';
import {
  fetchArticleItemByLocale,
  patchArticleFieldDataForLocale,
} from '@/lib/webflow/locale-items';

const SAFE_FIELDS = new Set<OpportunitySafeField>(['seoTitle', 'metaDescription']);

export function assertProposalsAreSafe(proposals: OpportunityProposal[]): void {
  for (const p of proposals) {
    if (!SAFE_FIELDS.has(p.field)) {
      throw Object.assign(
        new Error(`Usikker field "${p.field}" — kun seoTitle/metaDescription tilladt`),
        { code: 'unsafe_field' }
      );
    }
  }
}

/**
 * Apply metadata proposals to the opportunity's Webflow locale (safe fields only).
 * Re-reads live CMS before write — skips if editor changed SEO/meta since scan.
 */
export async function applyOpportunityProposals(args: {
  opportunityId: string;
  actor: string;
  mode: 'approved' | 'auto';
  confirmOverwrite?: boolean;
}): Promise<{ opportunity: SeoOpportunity; versionIds: string[] }> {
  const opp = await getOpportunity(args.opportunityId);
  if (!opp) throw Object.assign(new Error('Opportunity ikke fundet'), { code: 'not_found' });

  if (args.mode === 'auto') {
    const runtime = await resolveAutomaticOpportunityRuntime();
    if (!runtime.shouldAutoOptimize) {
      throw Object.assign(
        new Error(
          runtime.killSwitchEnabled
            ? `Forbindelser usunde — ${runtime.connectionSummary}`
            : 'Auto-optimering er nød-stoppet'
        ),
        { code: runtime.killSwitchEnabled ? 'connections_unhealthy' : 'auto_disabled' }
      );
    }
  } else if (opp.status !== 'approved') {
    throw Object.assign(new Error(`Kan ikke apply i status ${opp.status} — godkend først`), {
      code: 'bad_status',
    });
  }

  if (!args.confirmOverwrite) {
    throw Object.assign(new Error('confirmOverwrite=true påkrævet'), {
      code: 'confirm_required',
    });
  }

  assertProposalsAreSafe(opp.proposals);
  if (opp.proposals.length === 0) {
    throw Object.assign(new Error('Ingen sikre metadata-forslag at anvende'), {
      code: 'no_proposals',
    });
  }

  const idempotencyKey =
    opp.idempotencyKey ||
    buildIdempotencyKey({
      itemId: opp.itemId,
      url: opp.url,
      fingerprint: opp.fingerprint,
      proposedTitle: opp.proposals.find((p) => p.field === 'seoTitle')?.proposedValue,
      proposedMeta: opp.proposals.find((p) => p.field === 'metaDescription')?.proposedValue,
    });

  const claimed = await claimIdempotencyKey({
    key: idempotencyKey,
    opportunityId: opp.id,
  });
  if (!claimed) {
    throw Object.assign(new Error('Idempotency-key allerede anvendt'), {
      code: 'idempotency_duplicate',
    });
  }

  const cmsLocaleId = cmsLocaleIdFor(opp.locale || 'da');
  const slugs = getCmsSeoSlugs();
  let live;
  try {
    live = await fetchArticleItemByLocale(opp.itemId, cmsLocaleId);
  } catch (e) {
    await completeIdempotencyKey({ key: idempotencyKey, status: 'failed' });
    throw e;
  }

  const fd = (live.fieldData || {}) as Record<string, unknown>;
  const liveSeo = isCmsSeoFieldEmpty(fd[slugs.seoTitle])
    ? null
    : String(fd[slugs.seoTitle]).trim();
  const liveMeta = isCmsSeoFieldEmpty(fd[slugs.metaDescription])
    ? null
    : String(fd[slugs.metaDescription]).trim();

  const scannedTitle =
    opp.scannedSeoTitle ??
    opp.proposals.find((p) => p.field === 'seoTitle')?.currentValue ??
    null;
  const scannedMeta =
    opp.scannedMetaDescription ??
    opp.proposals.find((p) => p.field === 'metaDescription')?.currentValue ??
    null;

  const stale = detectStaleSeoWrite({
    scannedSeoTitle: scannedTitle,
    scannedMetaDescription: scannedMeta,
    liveSeoTitle: liveSeo,
    liveMetaDescription: liveMeta,
    scannedCmsLastUpdated: opp.scannedCmsLastUpdated,
    liveCmsLastUpdated: live.lastUpdated || null,
  });
  if (stale.stale) {
    await completeIdempotencyKey({ key: idempotencyKey, status: 'failed' });
    await updateOpportunityStatus({
      id: opp.id,
      status: 'skipped',
      actor: args.actor,
      extra: { skipReason: stale.reason || 'stale_write' },
    });
    throw Object.assign(
      new Error(
        `Stale-write skip — redaktør har ændret ${stale.detail || 'SEO-felter'} siden scan`
      ),
      { code: stale.reason || 'stale_write' }
    );
  }

  const patchFields: { seoTitle?: string; metaDescription?: string } = {};
  const versionIds: string[] = [...(opp.versionIds || [])];

  for (const proposal of opp.proposals) {
    if (proposal.field === 'seoTitle') patchFields.seoTitle = proposal.proposedValue;
    if (proposal.field === 'metaDescription') {
      patchFields.metaDescription = proposal.proposedValue;
    }
  }

  const cmsPatch = toWebflowSeoPatch(patchFields);
  assertCmsPatchIsSafe(cmsPatch);
  if (Object.keys(cmsPatch).length === 0) {
    await completeIdempotencyKey({ key: idempotencyKey, status: 'failed' });
    throw Object.assign(new Error('Tom CMS-patch'), { code: 'empty_patch' });
  }

  const appliedAt = new Date().toISOString();
  try {
    for (const proposal of opp.proposals) {
      const ver = await saveMetaVersion({
        opportunityId: opp.id,
        itemId: opp.itemId,
        locale: opp.locale,
        field: proposal.field,
        before: proposal.currentValue,
        after: proposal.proposedValue,
        appliedAt,
        appliedBy: args.actor,
        idempotencyKey,
      });
      versionIds.push(ver.id);
    }

    // Persist server-side schema snapshot in version history (never editorial CMS fields).
    if (opp.serverJsonLdHtml) {
      const schemaVer = await saveMetaVersion({
        opportunityId: opp.id,
        itemId: opp.itemId,
        locale: opp.locale,
        field: 'serverJsonLd',
        before: null,
        after: opp.serverJsonLdHtml,
        appliedAt,
        appliedBy: args.actor,
        idempotencyKey,
      });
      versionIds.push(schemaVer.id);
    }

    await patchArticleFieldDataForLocale(opp.itemId, cmsPatch, cmsLocaleId);
    await completeIdempotencyKey({ key: idempotencyKey, status: 'applied' });
    if (opp.url) {
      await setUrlLastAppliedAt({
        url: opp.url,
        appliedAt,
        opportunityId: opp.id,
      });
    }
  } catch (e) {
    await completeIdempotencyKey({ key: idempotencyKey, status: 'failed' });
    throw e;
  }

  const updated = await updateOpportunityStatus({
    id: opp.id,
    status: 'applied',
    actor: args.actor,
    extra: {
      appliedAt,
      appliedBy: args.actor,
      versionIds,
      idempotencyKey,
    },
  });

  await appendAudit({
    actor: args.actor,
    action: args.mode === 'auto' ? 'auto_apply' : 'apply',
    opportunityId: opp.id,
    detail: `fields=${opp.proposals.map((p) => p.field).join(',')} item=${opp.itemId} locale=${opp.locale} key=${idempotencyKey}`,
  });

  return { opportunity: updated, versionIds };
}

export async function approveOpportunity(args: {
  opportunityId: string;
  actor: string;
  applyNow?: boolean;
  confirmOverwrite?: boolean;
}): Promise<SeoOpportunity> {
  let opp = await updateOpportunityStatus({
    id: args.opportunityId,
    status: 'approved',
    actor: args.actor,
  });
  if (args.applyNow) {
    const result = await applyOpportunityProposals({
      opportunityId: args.opportunityId,
      actor: args.actor,
      mode: 'approved',
      confirmOverwrite: args.confirmOverwrite === true,
    });
    opp = result.opportunity;
  }
  return opp;
}

export async function rejectOpportunity(args: {
  opportunityId: string;
  actor: string;
}): Promise<SeoOpportunity> {
  return updateOpportunityStatus({
    id: args.opportunityId,
    status: 'rejected',
    actor: args.actor,
  });
}

/**
 * Rollback last applied metadata versions for an opportunity.
 */
export async function rollbackOpportunity(args: {
  opportunityId: string;
  actor: string;
}): Promise<SeoOpportunity> {
  const opp = await getOpportunity(args.opportunityId);
  if (!opp) throw Object.assign(new Error('Opportunity ikke fundet'), { code: 'not_found' });
  if (opp.status !== 'applied' && opp.status !== 'rolled_back') {
    throw Object.assign(new Error('Rollback kræver applied opportunity'), {
      code: 'bad_status',
    });
  }
  const versionIds = opp.versionIds || [];
  if (versionIds.length === 0) {
    throw Object.assign(new Error('Ingen versionshistorik at rulle tilbage'), {
      code: 'no_versions',
    });
  }

  const cmsLocaleId = cmsLocaleIdFor(opp.locale || 'da');
  const patchFields: { seoTitle?: string; metaDescription?: string } = {};

  for (const vid of versionIds) {
    const ver = await getMetaVersion(vid);
    if (!ver || ver.rolledBackAt) continue;
    if (ver.field === 'serverJsonLd') {
      await saveMetaVersion({
        ...ver,
        rolledBackAt: new Date().toISOString(),
        rolledBackBy: args.actor,
      });
      continue;
    }
    if (ver.field === 'seoTitle') {
      patchFields.seoTitle = ver.before || '';
    }
    if (ver.field === 'metaDescription') {
      patchFields.metaDescription = ver.before || '';
    }
    await saveMetaVersion({
      ...ver,
      rolledBackAt: new Date().toISOString(),
      rolledBackBy: args.actor,
    });
  }

  const cmsPatch = toWebflowSeoPatch({
    seoTitle: patchFields.seoTitle,
    metaDescription: patchFields.metaDescription,
  });
  const slugs = getCmsSeoSlugs();
  const fieldData: Record<string, string> = { ...cmsPatch };
  if (patchFields.seoTitle === '' && !(slugs.seoTitle in fieldData)) {
    fieldData[slugs.seoTitle] = '';
  }
  if (patchFields.metaDescription === '' && !(slugs.metaDescription in fieldData)) {
    fieldData[slugs.metaDescription] = '';
  }
  if (Object.keys(fieldData).length > 0) {
    assertCmsPatchIsSafe(fieldData);
    await patchArticleFieldDataForLocale(opp.itemId, fieldData, cmsLocaleId);
  }

  return updateOpportunityStatus({
    id: opp.id,
    status: 'rolled_back',
    actor: args.actor,
  });
}

/**
 * Automatic apply path after collect/optimize scan.
 * Enforces batch limit, cooldown, confidence, evidence, validation.
 */
export async function maybeAutoApplyOpportunities(args: {
  opportunities: SeoOpportunity[];
  actor: string;
  now?: Date;
  /** Injected for tests. */
  runtime?: Awaited<ReturnType<typeof resolveAutomaticOpportunityRuntime>>;
  applyFn?: typeof applyOpportunityProposals;
  getUrlLastAppliedAtFn?: typeof getUrlLastAppliedAt;
  updateStatusFn?: typeof updateOpportunityStatus;
}): Promise<{ applied: string[]; skipped: Array<{ id: string; reason: string }> }> {
  const runtime = args.runtime || (await resolveAutomaticOpportunityRuntime());
  const applied: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  if (!runtime.killSwitchEnabled) {
    return {
      applied,
      skipped: args.opportunities.map((o) => ({ id: o.id, reason: 'kill_switch_off' })),
    };
  }
  if (!runtime.shouldAutoOptimize) {
    return {
      applied,
      skipped: args.opportunities.map((o) => ({
        id: o.id,
        reason: 'connections_unhealthy',
      })),
    };
  }

  const applyFn = args.applyFn || applyOpportunityProposals;
  const cooldownFn = args.getUrlLastAppliedAtFn || getUrlLastAppliedAt;
  const statusFn = args.updateStatusFn || updateOpportunityStatus;
  let appliedCount = 0;

  // Highest score first
  const ordered = [...args.opportunities].sort((a, b) => b.score - a.score);

  for (const opp of ordered) {
    if (appliedCount >= OPPORTUNITY_MAX_APPLY_PER_RUN) {
      skipped.push({ id: opp.id, reason: 'batch_limit' });
      continue;
    }
    if (opp.status === 'applied' || opp.status === 'rejected' || opp.status === 'dismissed') {
      skipped.push({ id: opp.id, reason: `status_${opp.status}` });
      continue;
    }

    const lastApplied = await cooldownFn(opp.url);
    const gate = evaluateAutoApplyGuardrails({
      opportunity: opp,
      lastAppliedAtForUrl: lastApplied,
      appliedCountInRun: appliedCount,
      now: args.now,
    });
    if (!gate.allow) {
      skipped.push({ id: opp.id, reason: gate.reason || 'skipped' });
      try {
        await statusFn({
          id: opp.id,
          status: 'skipped',
          actor: args.actor,
          extra: { skipReason: gate.reason || 'skipped' },
        });
      } catch {
        /* ignore status write failures in auto path */
      }
      continue;
    }

    try {
      // Mark approved then auto-apply
      await statusFn({
        id: opp.id,
        status: 'approved',
        actor: args.actor,
      });
      await applyFn({
        opportunityId: opp.id,
        actor: args.actor,
        mode: 'auto',
        confirmOverwrite: true,
      });
      applied.push(opp.id);
      appliedCount += 1;
    } catch (e) {
      skipped.push({
        id: opp.id,
        reason: e instanceof Error ? e.message.slice(0, 120) : 'apply_failed',
      });
    }
  }

  return { applied, skipped };
}
