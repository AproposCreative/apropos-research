/**
 * Safe metadata proposals only — never editorial title, body, or stance.
 */

import type {
  OpportunityEvidence,
  OpportunityProposal,
  OpportunitySignalKind,
} from '@/lib/seo-engine/opportunity-engine/types';
import { isCmsSeoFieldEmpty } from '@/lib/seo-engine/webflow-adapter';

const SEO_TITLE_MAX = 60;
const META_MAX = 155;

/**
 * Build concrete, evidence-based metadata suggestions.
 * Deterministic heuristics — no LLM required for recommendation mode.
 */
export function buildSafeMetadataProposals(args: {
  title: string;
  signals: OpportunitySignalKind[];
  evidence: OpportunityEvidence;
  language?: 'da' | 'en';
}): OpportunityProposal[] {
  const proposals: OpportunityProposal[] = [];
  const query = (args.evidence.query || '').trim();
  const currentTitle = args.evidence.currentSeoTitle;
  const currentMeta = args.evidence.currentMetaDescription;
  const lang = args.language || 'da';

  const needsTitle =
    args.signals.includes('weak_or_missing_meta') ||
    args.signals.includes('high_impressions_low_ctr') ||
    args.signals.includes('position_4_to_20') ||
    args.signals.includes('rising_query');

  if (needsTitle) {
    const proposedTitle = craftSeoTitle({
      editorialTitle: args.title,
      query,
      current: currentTitle,
      language: lang,
    });
    if (proposedTitle && proposedTitle !== String(currentTitle || '').trim()) {
      proposals.push({
        field: 'seoTitle',
        currentValue: isCmsSeoFieldEmpty(currentTitle) ? null : String(currentTitle).trim(),
        proposedValue: proposedTitle,
        rationale: query
          ? `Inkludér den evidensbaserede query "${query}" i SEO-title for bedre CTR`
          : 'Styrk SEO-title længde/klarhed ud fra SERP-signaler',
      });
    }
  }

  const needsMeta =
    args.signals.includes('weak_or_missing_meta') ||
    args.signals.includes('high_impressions_low_ctr') ||
    args.signals.includes('declining_article');

  if (needsMeta) {
    const proposedMeta = craftMetaDescription({
      editorialTitle: args.title,
      query,
      current: currentMeta,
      language: lang,
      ctr: args.evidence.ctr,
    });
    if (proposedMeta && proposedMeta !== String(currentMeta || '').trim()) {
      proposals.push({
        field: 'metaDescription',
        currentValue: isCmsSeoFieldEmpty(currentMeta) ? null : String(currentMeta).trim(),
        proposedValue: proposedMeta,
        rationale: 'Meta-description justeret for CTR uden at ændre redaktionel holdning',
      });
    }
  }

  return proposals;
}

function craftSeoTitle(args: {
  editorialTitle: string;
  query: string;
  current: string | null | undefined;
  language: 'da' | 'en';
}): string {
  const base = (args.current && !isCmsSeoFieldEmpty(args.current)
    ? String(args.current)
    : args.editorialTitle
  ).trim();
  if (!args.query) return truncate(base, SEO_TITLE_MAX);
  const q = args.query.trim();
  if (base.toLowerCase().includes(q.toLowerCase())) return truncate(base, SEO_TITLE_MAX);
  const combined = `${base} — ${q}`;
  if (combined.length <= SEO_TITLE_MAX) return combined;
  // Prefer keeping query
  const budget = Math.max(12, SEO_TITLE_MAX - q.length - 3);
  return truncate(`${truncate(base, budget)} — ${q}`, SEO_TITLE_MAX);
}

function craftMetaDescription(args: {
  editorialTitle: string;
  query: string;
  current: string | null | undefined;
  language: 'da' | 'en';
  ctr?: number | null;
}): string {
  if (args.current && !isCmsSeoFieldEmpty(args.current)) {
    const cur = String(args.current).trim();
    if (cur.length >= 70 && cur.length <= 170) {
      if (!args.query || cur.toLowerCase().includes(args.query.toLowerCase())) return cur;
    }
  }
  const hook =
    args.language === 'en'
      ? 'Read the Apropos Magazine take'
      : 'Læs Apropos Magazines vurdering';
  const qBit = args.query ? (args.language === 'en' ? ` on ${args.query}` : ` af ${args.query}`) : '';
  const raw = `${args.editorialTitle.trim()}${qBit}. ${hook}.`;
  return truncate(raw, META_MAX);
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const sliced = t.slice(0, max);
  const sp = sliced.lastIndexOf(' ');
  if (sp >= Math.floor(max * 0.55)) return sliced.slice(0, sp).trim();
  return sliced.trim();
}
