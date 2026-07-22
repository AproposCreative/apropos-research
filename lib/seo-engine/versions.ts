/**
 * SEO Engine version stamps — bump when behavior/contracts change.
 */

export const SEO_ENGINE_VERSION = '1.0.0';
export const SEO_ENGINE_SCHEMA_VERSION = '1.0.0';
export const SEO_ENGINE_PROMPT_VERSION = '1.0.0';
export const SEO_ENGINE_VALIDATOR_VERSION = '1.0.0';
export const SEO_ENGINE_JSONLD_VERSION = '1.0.0';

/** Body longer than this uses the explicit long-article extract path. */
export const SEO_ENGINE_LONG_ARTICLE_CHARS = 48_000;

/** Minimum body length before analyze is allowed. */
export const SEO_ENGINE_MIN_BODY_CHARS = 200;

/** Evidence quote max length. */
export const SEO_ENGINE_EVIDENCE_QUOTE_MAX = 180;

/** Soft Firestore snapshot budget (bytes) before forcing extract mode. */
export const SEO_ENGINE_SNAPSHOT_SOFT_MAX_BYTES = 900_000;

/**
 * Hard total budget for snapshot doc (contract JSON + normalizedText).
 * Must stay under Firestore's ~1 MiB document limit with headroom for metadata.
 */
export const SEO_ENGINE_SNAPSHOT_HARD_MAX_BYTES = 950_000;
