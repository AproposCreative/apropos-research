/**
 * Apply / rollback for opportunity proposals.
 * Default is recommendation/approval — never auto-overwrites editorial title/body/stance.
 * Only seoTitle + metaDescription when Auto-optimering is explicitly enabled (or after approve).
 */

import {
  getMetaVersion,
  getOpportunity,
  saveMetaVersion,
  updateOpportunityStatus,
  appendAudit,
} from '@/lib/seo-engine/opportunity-engine/store';
import { resolveAutoOpportunityOptimizationEnabled } from '@/lib/seo-engine/opportunity-engine/settings';
import type {
  OpportunityProposal,
  OpportunitySafeField,
  SeoOpportunity,
} from '@/lib/seo-engine/opportunity-engine/types';
import { toWebflowSeoPatch } from '@/lib/seo-engine/webflow-adapter';
import {
  fetchArticleItemByLocale,
  patchArticleFieldDataForLocale,
  resolveWebflowLocaleIds,
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
 * Apply approved (or auto-approved) metadata proposals to Webflow DK locale.
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
    const enabled = await resolveAutoOpportunityOptimizationEnabled();
    if (!enabled) {
      throw Object.assign(
        new Error('Auto-optimering er slået fra — kun recommendation/approval mode'),
        { code: 'auto_disabled' }
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

  const { dk } = resolveWebflowLocaleIds();
  const live = await fetchArticleItemByLocale(opp.itemId, dk);
  const patchFields: { seoTitle?: string; metaDescription?: string } = {};
  const versionIds: string[] = [...(opp.versionIds || [])];

  for (const proposal of opp.proposals) {
    if (proposal.field === 'seoTitle') patchFields.seoTitle = proposal.proposedValue;
    if (proposal.field === 'metaDescription') {
      patchFields.metaDescription = proposal.proposedValue;
    }
  }

  const cmsPatch = toWebflowSeoPatch(patchFields);
  if (Object.keys(cmsPatch).length === 0) {
    throw Object.assign(new Error('Tom CMS-patch'), { code: 'empty_patch' });
  }

  // Version history before write
  const appliedAt = new Date().toISOString();
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
    });
    versionIds.push(ver.id);
  }

  await patchArticleFieldDataForLocale(opp.itemId, cmsPatch, dk);

  const updated = await updateOpportunityStatus({
    id: opp.id,
    status: 'applied',
    actor: args.actor,
    extra: {
      appliedAt,
      appliedBy: args.actor,
      versionIds,
    },
  });

  await appendAudit({
    actor: args.actor,
    action: args.mode === 'auto' ? 'auto_apply' : 'apply',
    opportunityId: opp.id,
    detail: `fields=${opp.proposals.map((p) => p.field).join(',')} item=${opp.itemId}`,
  });

  // Touch live for typecheck unused warning avoidance — we verified fetch succeeded
  void live;

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

  const { dk } = resolveWebflowLocaleIds();
  const patchFields: { seoTitle?: string; metaDescription?: string } = {};

  for (const vid of versionIds) {
    const ver = await getMetaVersion(vid);
    if (!ver || ver.rolledBackAt) continue;
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
  // Allow empty string restore via direct slug patch when needed
  const slugs = (await import('@/lib/seo-engine/webflow-adapter')).getCmsSeoSlugs();
  const fieldData: Record<string, string> = { ...cmsPatch };
  if (patchFields.seoTitle === '' && !(slugs.seoTitle in fieldData)) {
    fieldData[slugs.seoTitle] = '';
  }
  if (patchFields.metaDescription === '' && !(slugs.metaDescription in fieldData)) {
    fieldData[slugs.metaDescription] = '';
  }
  if (Object.keys(fieldData).length > 0) {
    await patchArticleFieldDataForLocale(opp.itemId, fieldData, dk);
  }

  return updateOpportunityStatus({
    id: opp.id,
    status: 'rolled_back',
    actor: args.actor,
  });
}

/**
 * After a scan, optionally auto-apply high-confidence safe proposals when flag is on.
 * Never touches editorial title/body/stance.
 */
export async function maybeAutoApplyOpportunities(args: {
  opportunities: SeoOpportunity[];
  actor: string;
  minScore?: number;
}): Promise<{ applied: string[]; skipped: string[] }> {
  const enabled = await resolveAutoOpportunityOptimizationEnabled();
  const applied: string[] = [];
  const skipped: string[] = [];
  if (!enabled) {
    return { applied, skipped: args.opportunities.map((o) => o.id) };
  }
  const minScore = args.minScore ?? 50;
  for (const opp of args.opportunities) {
    if (opp.score < minScore || opp.proposals.length === 0) {
      skipped.push(opp.id);
      continue;
    }
    // Only auto-apply weak/missing meta — not cannibalization-only rows
    const safeAuto =
      opp.signals.includes('weak_or_missing_meta') ||
      opp.signals.includes('high_impressions_low_ctr');
    if (!safeAuto) {
      skipped.push(opp.id);
      continue;
    }
    try {
      await updateOpportunityStatus({
        id: opp.id,
        status: 'approved',
        actor: args.actor,
      });
      await applyOpportunityProposals({
        opportunityId: opp.id,
        actor: args.actor,
        mode: 'auto',
        confirmOverwrite: true,
      });
      applied.push(opp.id);
    } catch {
      skipped.push(opp.id);
    }
  }
  return { applied, skipped };
}
