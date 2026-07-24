/** Client-safe constants for Arkiv-audit apply UI (no Node/Firebase imports). */

export const ARCHIVE_APPLY_MAX_BATCH = 20;
export const ARCHIVE_APPLY_PREVIEW_SCHEMA = 1;
export const ARCHIVE_APPLY_PREVIEW_TTL_MS = 2 * 60 * 60 * 1000; // 2h
export const ARCHIVE_APPLY_COL = 'seoEngineArchiveApplyPreviews';
/** Durable apply backups (body of JSON backup) — survives ephemeral /tmp on Vercel. */
export const ARCHIVE_APPLY_BACKUP_COL = 'seoEngineArchiveApplyBackups';
export const ARCHIVE_APPLY_SYSTEM_USER = 'system:seo-archive-apply';

/** Default pause between Webflow locale fetches during preview (rate-limit pacing). */
export const ARCHIVE_APPLY_PREVIEW_PACE_MS = 300;

/** Shown when Webflow returns 429 / transient overload after retries. */
export const ARCHIVE_APPLY_WEBFLOW_BUSY_DA =
  'Webflow midlertidigt overbelastet — prøv igen om et øjeblik';

/** Soft cap for body/canonical writes (stricter than SEO title/meta). */
export const ARCHIVE_CONTENT_MAX_BATCH = 8;

export type ArchiveFixKindUi =
  | 'seo_meta'
  | 'internal_links'
  | 'headings'
  | 'canonical'
  | 'image_alt';

export const ARCHIVE_FIX_KIND_OPTIONS: Array<{ id: ArchiveFixKindUi; label: string }> = [
  { id: 'seo_meta', label: 'SEO-title + meta' },
  { id: 'internal_links', label: 'Interne links' },
  { id: 'headings', label: 'Overskrifter' },
  { id: 'canonical', label: 'Canonical' },
  { id: 'image_alt', label: 'Billede-alt' },
];

/** Rows with fetch errors / missing EN should not be auto-selected for apply. */
export function isArchiveRowEligibleForApply(row: {
  locale?: string;
  findings?: Array<{ code?: string; message?: string }>;
  siblingLocalePresent?: boolean | null;
}): boolean {
  const codes = new Set((row.findings || []).map((f) => String(f.code || '')));
  if (codes.has('fetch_error')) return false;
  if (codes.has('unpublished')) return false;
  if (row.locale === 'en' && row.siblingLocalePresent === false) return false;
  if (
    row.locale === 'en' &&
    (row.findings || []).some((f) => /mangler|not found|404/i.test(String(f.message || '')))
  ) {
    return false;
  }
  return true;
}
