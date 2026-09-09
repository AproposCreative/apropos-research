/**
 * Apply / rollback for opportunity proposals.
 *
 * Automatic production path writes ONLY seo-title + meta-description (staged, verified metadata). Never editorial title/body/stance/rating/slug/dates.
 */

import { acquireCmsWriteLease } from '@/lib/seo-engine/cms-write-lease';
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
  OpportunityMetaVersion,
  OpportunityProposal,
  OpportunitySafeField,
  SeoOpportunity,
} from '@/lib/seo-engine/opportunity-engine/types';
import { getCmsSeoSlugs, isCmsSeoFieldEmpty } from '@/lib/seo-engine/webflow-adapter';
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
function conflict(message: string): never {
  throw Object.assign(new Error(message), { code: 'revision_conflict' });
}

function cmsValue(fd: Record<string, unknown>, field: 'seoTitle' | 'metaDescription'): string {
  return String(fd[getCmsSeoSlugs()[field]] ?? '').trim();
}

async function assertAutoMayWrite(): Promise<void> {
  const runtime = await resolveAutomaticOpportunityRuntime();
  if (!runtime.shouldAutoOptimize) {
    throw Object.assign(new Error('Automatisk SEO er stoppet eller forbindelserne er usunde'), {
      code: runtime.killSwitchEnabled ? 'connections_unhealthy' : 'auto_disabled',
    });
  }
}

async function loadBoundVersions(opp: SeoOpportunity, ids: string[]): Promise<OpportunityMetaVersion[]> {
  const versions: OpportunityMetaVersion[] = [];
  for (const id of ids) {
    const version = await getMetaVersion(id);
    if (!version || version.opportunityId !== opp.id || version.itemId !== opp.itemId ||
        (version.locale || 'da') !== (opp.locale || 'da')) {
      conflict('Versionshistorikken matcher ikke artikel og locale');
    }
    versions.push(version);
  }
  return versions;
}

export async function applyOpportunityProposals(args: {
  opportunityId: string;
  actor: string;
  mode: 'approved' | 'auto';
  confirmOverwrite?: boolean;
}): Promise<{ opportunity: SeoOpportunity; versionIds: string[] }> {
  const initial = await getOpportunity(args.opportunityId);
  if (!initial) throw Object.assign(new Error('Opportunity ikke fundet'), { code: 'not_found' });
  if (!args.confirmOverwrite) throw Object.assign(new Error('confirmOverwrite=true påkrævet'), { code: 'confirm_required' });
  const lease = await acquireCmsWriteLease(initial.itemId, initial.locale || 'da');
  let owner: string | null = null;
  let key = '';
  try {
    // Read again under the item lease, including approval/rejection changes.
    const opp = await getOpportunity(args.opportunityId);
    if (!opp || opp.itemId !== initial.itemId || opp.locale !== initial.locale) conflict('Opportunity ændret');
    if (opp.status !== 'approved') throw Object.assign(new Error('Godkend først'), { code: 'bad_status' });
    if (args.mode === 'auto') await assertAutoMayWrite();
    assertProposalsAreSafe(opp.proposals);
    if (!opp.proposals.length) throw Object.assign(new Error('Ingen forslag'), { code: 'no_proposals' });
    key = opp.pendingApply?.key || opp.idempotencyKey || buildIdempotencyKey({
      itemId: opp.itemId, url: opp.url, fingerprint: opp.fingerprint,
      proposedTitle: opp.proposals.find((p) => p.field === 'seoTitle')?.proposedValue,
      proposedMeta: opp.proposals.find((p) => p.field === 'metaDescription')?.proposedValue,
    });
    owner = await claimIdempotencyKey({ key, opportunityId: opp.id });
    if (!owner) throw Object.assign(new Error('Skrivning allerede anvendt eller i gang'), { code: 'idempotency_duplicate' });

    const cmsLocaleId = cmsLocaleIdFor(opp.locale || 'da');
    const live = await fetchArticleItemByLocale(opp.itemId, cmsLocaleId);
    if (live.isDraft === true || !live.lastPublished) conflict('Artiklen er ikke publiceret');
    const appliedAt = opp.pendingApply?.appliedAt || new Date().toISOString();
    let versions: OpportunityMetaVersion[];
    if (opp.pendingApply) {
      // A previous request may have written CMS and lost its response. Never regenerate.
      versions = await loadBoundVersions(opp, opp.pendingApply.versionIds);
    } else {
      const slugs = getCmsSeoSlugs();
      const stale = detectStaleSeoWrite({
        scannedSeoTitle: opp.scannedSeoTitle ?? opp.proposals.find((p) => p.field === 'seoTitle')?.currentValue ?? null,
        scannedMetaDescription: opp.scannedMetaDescription ?? opp.proposals.find((p) => p.field === 'metaDescription')?.currentValue ?? null,
        liveSeoTitle: isCmsSeoFieldEmpty(live.fieldData[slugs.seoTitle]) ? null : cmsValue(live.fieldData, 'seoTitle'),
        liveMetaDescription: isCmsSeoFieldEmpty(live.fieldData[slugs.metaDescription]) ? null : cmsValue(live.fieldData, 'metaDescription'),
        scannedCmsLastUpdated: opp.scannedCmsLastUpdated,
        liveCmsLastUpdated: live.lastUpdated || null,
      });
      if (stale.stale) conflict('CMS ændret siden scan; scan og godkend igen');
      versions = [];
      for (const proposal of opp.proposals) {
        versions.push(await saveMetaVersion({
          opportunityId: opp.id, itemId: opp.itemId, locale: opp.locale,
          field: proposal.field, before: cmsValue(live.fieldData, proposal.field),
          after: proposal.proposedValue, appliedAt, appliedBy: args.actor, idempotencyKey: key,
        }));
      }
      await updateOpportunityStatus({ id: opp.id, status: 'approved', actor: args.actor, extra: {
        pendingApply: { key, versionIds: versions.map((v) => v.id), appliedAt, cmsLastUpdated: live.lastUpdated || null },
      } });
    }

    const patch: Record<string, string> = {};
    for (const version of versions) {
      if (version.field === 'serverJsonLd') continue;
      const actual = cmsValue(live.fieldData, version.field);
      if (actual === version.after.trim()) continue; // reconcile a successful previous write
      if (actual !== String(version.before ?? '').trim()) conflict('Ny redaktørændring; SEO må ikke overskrive');
      patch[getCmsSeoSlugs()[version.field]] = version.after;
    }
    assertCmsPatchIsSafe(patch);
    if (Object.keys(patch).length && opp.pendingApply && live.lastUpdated !== opp.pendingApply.cmsLastUpdated) {
      conflict('CMS-indhold ændret siden den afbrudte skrivning');
    }
    if (Object.keys(patch).length) {
      // Recheck after saving the backup/operation; those network roundtrips can take time.
      const fresh = await fetchArticleItemByLocale(opp.itemId, cmsLocaleId);
      if (fresh.isDraft === true || !fresh.lastPublished || fresh.lastUpdated !== live.lastUpdated ||
          versions.some((v) => v.field !== 'serverJsonLd' && cmsValue(fresh.fieldData, v.field) !== cmsValue(live.fieldData, v.field))) {
        conflict('CMS ændret før skrivning');
      }
      const current = await getOpportunity(opp.id);
      if (current?.status !== 'approved' || current.pendingApply?.key !== key) {
        conflict('Godkendelsen er ændret før CMS-skrivning');
      }
      if (args.mode === 'auto') await assertAutoMayWrite();
      await lease.assertOwned();
      await patchArticleFieldDataForLocale(opp.itemId, patch, cmsLocaleId);
    }
    const verified = await fetchArticleItemByLocale(opp.itemId, cmsLocaleId);
    for (const version of versions) {
      if (version.field !== 'serverJsonLd' && cmsValue(verified.fieldData, version.field) !== version.after.trim()) {
        throw Object.assign(new Error('CMS readback matcher ikke forslaget'), { code: 'readback_failed' });
      }
    }
    const versionIds = [...new Set([...(opp.versionIds || []), ...versions.map((v) => v.id)])];
    if (opp.url) await setUrlLastAppliedAt({ url: opp.url, appliedAt, opportunityId: opp.id });
    const updated = await updateOpportunityStatus({ id: opp.id, status: 'applied', actor: args.actor, extra: {
      appliedAt, appliedBy: args.actor, versionIds, idempotencyKey: key, pendingApply: null,
      cmsWriteState: 'staged_verified', cmsVerifiedAt: new Date().toISOString(),
    } });
    await completeIdempotencyKey({ key, owner, status: 'applied' });
    owner = null;
    await appendAudit({ actor: args.actor, action: args.mode === 'auto' ? 'auto_apply' : 'apply',
      opportunityId: opp.id, detail: `staged_verified item=${opp.itemId} locale=${opp.locale}; not published`,
    });
    return { opportunity: updated, versionIds };
  } catch (error) {
    if (owner) await completeIdempotencyKey({ key, owner, status: 'failed' }).catch(() => undefined);
    throw error;
  } finally {
    await lease.release().catch(() => undefined);
  }
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
  const initial = await getOpportunity(args.opportunityId);
  if (!initial) throw Object.assign(new Error('Opportunity ikke fundet'), { code: 'not_found' });
  const lease = await acquireCmsWriteLease(initial.itemId, initial.locale || 'da');
  try {
    const opp = await getOpportunity(args.opportunityId);
    if (!opp || opp.itemId !== initial.itemId || opp.locale !== initial.locale) conflict('Opportunity ændret');
    if (!opp.pendingApply && opp.status !== 'applied' && opp.status !== 'rolled_back') {
      throw Object.assign(new Error('Rollback kræver anvendt eller afbrudt skrivning'), { code: 'bad_status' });
    }
    const all = await loadBoundVersions(opp, opp.pendingApply?.versionIds || opp.versionIds || []);
    if (!all.length) throw Object.assign(new Error('Ingen versionshistorik'), { code: 'no_versions' });
    // Only undo the latest operation. Historical operations must remain historical.
    const latestAt = all.map((v) => v.appliedAt).sort().at(-1);
    const versions = all.filter((v) => v.appliedAt === latestAt);
    const cmsLocaleId = cmsLocaleIdFor(opp.locale || 'da');
    const live = await fetchArticleItemByLocale(opp.itemId, cmsLocaleId);
    const patch: Record<string, string> = {};
    for (const version of versions) {
      if (version.field === 'serverJsonLd') continue;
      const actual = cmsValue(live.fieldData, version.field);
      const before = String(version.before ?? '').trim();
      // Retry after a successful PATCH but failed history write: no second CMS mutation.
      if (actual === before) continue;
      if (actual !== version.after.trim() || version.rolledBackAt) conflict('Nyere CMS-redigering blokerer rollback');
      patch[getCmsSeoSlugs()[version.field]] = before;
    }
    if (Object.keys(patch).length) {
      assertCmsPatchIsSafe(patch);
      await lease.assertOwned();
      const fresh = await fetchArticleItemByLocale(opp.itemId, cmsLocaleId);
      if (fresh.lastUpdated !== live.lastUpdated || versions.some((v) =>
        v.field !== 'serverJsonLd' && cmsValue(fresh.fieldData, v.field) !== cmsValue(live.fieldData, v.field))) {
        conflict('CMS ændret før rollback');
      }
      await patchArticleFieldDataForLocale(opp.itemId, patch, cmsLocaleId);
    }
    const verified = await fetchArticleItemByLocale(opp.itemId, cmsLocaleId);
    for (const version of versions) {
      if (version.field !== 'serverJsonLd' && cmsValue(verified.fieldData, version.field) !== String(version.before ?? '').trim()) {
        throw Object.assign(new Error('Rollback readback fejlede'), { code: 'readback_failed' });
      }
    }
    // Completion markers are written only after CMS readback, never before PATCH.
    for (const version of versions) {
      if (!version.rolledBackAt) await saveMetaVersion({ ...version,
        rolledBackAt: new Date().toISOString(), rolledBackBy: args.actor,
      });
    }
    return await updateOpportunityStatus({ id: opp.id, status: 'rolled_back', actor: args.actor, extra: {
      pendingApply: null, versionIds: [...new Set([...(opp.versionIds || []), ...versions.map((v) => v.id)])],
      cmsWriteState: 'staged_verified', cmsVerifiedAt: new Date().toISOString(),
    } });
  } finally {
    await lease.release().catch(() => undefined);
  }
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
