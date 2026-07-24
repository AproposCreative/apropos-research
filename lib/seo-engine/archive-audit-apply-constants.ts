/** Client-safe constants for Arkiv-audit apply UI (no Node/Firebase imports). */

export const ARCHIVE_APPLY_MAX_BATCH = 20;
export const ARCHIVE_APPLY_PREVIEW_SCHEMA = 1;
export const ARCHIVE_APPLY_PREVIEW_TTL_MS = 2 * 60 * 60 * 1000; // 2h
export const ARCHIVE_APPLY_COL = 'seoEngineArchiveApplyPreviews';
export const ARCHIVE_APPLY_SYSTEM_USER = 'system:seo-archive-apply';

/** Default pause between Webflow locale fetches during preview (rate-limit pacing). */
export const ARCHIVE_APPLY_PREVIEW_PACE_MS = 300;

/** Shown when Webflow returns 429 / transient overload after retries. */
export const ARCHIVE_APPLY_WEBFLOW_BUSY_DA =
  'Webflow midlertidigt overbelastet — prøv igen om et øjeblik';
