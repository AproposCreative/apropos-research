/** A complete, archived response failed evidence validation, not a timeout. */
export class CompletedSemanticReviewError extends Error {
  constructor(error: unknown) {
    super(error instanceof Error && /^liv_semantic_review_(invalid|unanchored|repeated_evidence|insufficient_evidence)$/.test(error.message)
      ? error.message : 'liv_semantic_review_invalid');
    this.name = 'CompletedSemanticReviewError';
  }
}
