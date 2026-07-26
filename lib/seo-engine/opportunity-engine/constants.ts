/** Hard caps / thresholds for automatic opportunity optimization. */

/** Max existing articles that may be written in one optimize run. */
export const OPPORTUNITY_MAX_APPLY_PER_RUN = 10;

/** Cooldown after an auto/manual apply before the same URL may be written again. */
export const OPPORTUNITY_COOLDOWN_DAYS = 14;

/** Minimum composite confidence (0–1) to auto-apply. */
export const OPPORTUNITY_MIN_AUTO_CONFIDENCE = 0.65;

/** Minimum opportunity score to consider for auto-apply. */
export const OPPORTUNITY_MIN_AUTO_SCORE = 45;

/** Min GSC impressions before overwriting an already-strong SEO field. */
export const OPPORTUNITY_MIN_IMPRESSIONS_TO_OVERWRITE_STRONG = 200;

/** Min impressions for high_impressions_low_ctr style evidence. */
export const OPPORTUNITY_EVIDENCE_IMPRESSIONS_MIN = 80;

/** SEO title length bounds after craft. */
export const OPPORTUNITY_SEO_TITLE_MIN = 20;
export const OPPORTUNITY_SEO_TITLE_MAX = 60;

/** Meta description length bounds after craft. */
export const OPPORTUNITY_META_MIN = 70;
export const OPPORTUNITY_META_MAX = 160;

/** Fields that must never appear in an auto CMS patch. */
export const OPPORTUNITY_FORBIDDEN_CMS_FIELDS = [
  'name',
  'title',
  'subtitle',
  'intro',
  'content',
  'slug',
  'stjerne',
  'author',
  'start-dato',
  'slut-dato',
  'location',
  'festival',
  'canonical-url',
  'canonical',
] as const;
