import { checkReviewSeoTitle } from '@/lib/seo-engine/review-title-rule';

export type ArchiveAuditPatchRow = {
  itemId: string;
  locale: string;
  slug: string;
  title: string;
  priority: string;
  seoTitle: string;
  articleTypeHint?: string;
  findings: Array<{
    code: string;
    message: string;
    priority: string;
    evidence?: string;
    geoAeo?: boolean;
  }>;
  headingCount?: number | null;
  internalLinkCount?: number | null;
};

/** Recompute row priority from remaining findings (honest — review_title may stay P0). */
export function recomputeRowPriority(
  findings: Array<{ priority: string }>
): string {
  if (findings.some((f) => f.priority === 'P0')) return 'P0';
  if (findings.some((f) => f.priority === 'P1')) return 'P1';
  if (findings.some((f) => f.priority === 'P2')) return 'P2';
  return 'ok';
}

/**
 * Patch local scan rows after a successful SEO+meta apply so the table
 * reflects new title/meta and drops findings that are now satisfied.
 */
export function patchRowsAfterSeoMetaApply<T extends ArchiveAuditPatchRow>(
  rows: T[],
  proposals: Array<{
    itemId: string;
    locale: string;
    newSeoTitle?: string;
    newMetaDescription?: string;
  }>
): T[] {
  const byKey = new Map(
    proposals.map((p) => [`${p.itemId}:${p.locale}`, p] as [string, (typeof proposals)[number]])
  );
  return rows.map((row) => {
    const p = byKey.get(`${row.itemId}:${row.locale}`);
    if (!p) return row;
    const seoTitle = String(p.newSeoTitle || '').trim();
    const meta = String(p.newMetaDescription || '').trim();
    const findings = row.findings.filter((f) => {
      if (f.code === 'missing_seo_title' && seoTitle) return false;
      if (f.code === 'missing_meta_description' && meta) return false;
      if (f.code === 'weak_seo_title' && seoTitle.length >= 25) return false;
      if (f.code === 'short_meta' && meta.length >= 70) return false;
      if (f.code === 'review_title_keyword_missing') {
        const check = checkReviewSeoTitle({
          seoTitle,
          language: row.locale,
          articleType: row.articleTypeHint,
        });
        // Keep honest: only drop if review keyword now present (or rule N/A)
        return check.applies && !check.ok;
      }
      return true;
    });
    return {
      ...row,
      seoTitle: seoTitle || row.seoTitle,
      findings,
      priority: recomputeRowPriority(findings),
    };
  });
}

/** Patch local rows after content fixes (links / headings / canonical / alt). */
export function patchRowsAfterContentApply<T extends ArchiveAuditPatchRow>(
  rows: T[],
  proposals: Array<{
    itemId: string;
    locale: string;
    canonicalChanged?: boolean;
    thumbAltChanged?: boolean;
    links?: unknown[];
    headings?: unknown[];
    contentChanged?: boolean;
  }>
): T[] {
  const byKey = new Map(
    proposals.map((p) => [`${p.itemId}:${p.locale}`, p] as [string, (typeof proposals)[number]])
  );
  return rows.map((row) => {
    const p = byKey.get(`${row.itemId}:${row.locale}`);
    if (!p) return row;
    const findings = row.findings.filter((f) => {
      if (f.code === 'few_internal_links' && (p.links?.length || 0) > 0) return false;
      if (f.code === 'weak_heading_structure' && (p.headings?.length || 0) > 0) return false;
      if (f.code === 'missing_explicit_canonical' && p.canonicalChanged) return false;
      if (f.code === 'missing_image_alt' && p.thumbAltChanged) return false;
      return true;
    });
    return {
      ...row,
      findings,
      priority: recomputeRowPriority(findings),
      headingCount:
        (p.headings?.length || 0) > 0
          ? Math.max(row.headingCount || 0, 2)
          : row.headingCount,
      internalLinkCount:
        (p.links?.length || 0) > 0
          ? Math.max(row.internalLinkCount || 0, p.links!.length)
          : row.internalLinkCount,
    };
  });
}
