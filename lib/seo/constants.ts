/**
 * Single source of truth for SEO/Meta limits used across the app.
 *
 * Google's published guidance (and what most SEO tools enforce):
 * - Title: ~50–60 chars before truncation in SERPs.
 * - Meta description: ~155–160 chars before truncation in SERPs.
 *
 * We use 60 / 155 as our hard caps. These align with the limits documented in
 * `prompts/structure.apropos.md` so the model and the post-processor agree.
 */

export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 155;

/** Minimum useful length for an SEO title before we treat it as "missing". */
export const SEO_TITLE_MIN = 20;
/** Minimum useful length for a meta description before we treat it as "missing". */
export const SEO_DESCRIPTION_MIN = 70;
