import type { SourceSimilarityResult } from './source-similarity';
import { createHash } from 'node:crypto';
import type { BlockedSourceReview } from './blocked-review';

/** Safe diagnostics: no source text, URL query strings or provider errors. */
export class SourceSimilarityError extends Error {
  // Private field is intentionally excluded from JSON serialization and generic error logs.
  #review?: BlockedSourceReview;
  get blockedReview(): BlockedSourceReview | undefined { return this.#review; }
  readonly code: 'source_similarity_incomplete' | 'source_similarity_unapproved';
  readonly status: 422 | 503;
  readonly detail: {
    sourceHost: string;
    sourceHash: string;
    complete: boolean;
    failure: SourceSimilarityResult['failure'];
    reason: SourceSimilarityResult['reason'];
    scores: SourceSimilarityResult['scores'];
  };

  constructor(result: SourceSimilarityResult, source: { url: string; contentHash: string },
    review?: { text: string; model: string; voiceVersion: string }) {
    const code = result.complete ? 'source_similarity_unapproved' : 'source_similarity_incomplete';
    const message = result.complete
      ? 'Kildeligheden overskrider en kontroltærskel. Udkastet kræver gennemgang og eventuel omskrivning. Ingen publicering.'
      : 'Kildelighedskontrollen kunne ikke gennemføres. Dette er ikke en konstatering af plagiat. Ingen publicering.';
    const host = new URL(source.url).hostname;
    super(`${code}: ${message} Kilde: ${host}.`);
    this.name = 'SourceSimilarityError';
    this.code = code;
    this.status = result.complete ? 422 : 503;
    this.detail = { sourceHost: host, sourceHash: source.contentHash,
      complete: result.complete, failure: result.failure, reason: result.reason, scores: result.scores };
    if (review?.text.trim() && review.text.length <= 60000) {
      this.#review = { ...review, status: 'blocked', textHash: createHash('sha256').update(review.text).digest('hex') };
    }
  }
}
