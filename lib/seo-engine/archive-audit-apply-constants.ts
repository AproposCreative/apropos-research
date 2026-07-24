/** Client-safe constants for Arkiv-audit apply UI (no Node/Firebase imports). */

export const ARCHIVE_APPLY_MAX_BATCH = 20;
export const ARCHIVE_APPLY_PREVIEW_SCHEMA = 1;
export const ARCHIVE_APPLY_PREVIEW_TTL_MS = 2 * 60 * 60 * 1000; // 2h
export const ARCHIVE_APPLY_COL = 'seoEngineArchiveApplyPreviews';
export const ARCHIVE_APPLY_SYSTEM_USER = 'system:seo-archive-apply';
