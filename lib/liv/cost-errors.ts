/** Evidence for THIS attempted call only. Never infer non-payment from an error message. */
export class LivCostPretransportError extends Error {
  readonly providerAttempted = false as const;
  constructor(readonly code: string) {
    super(code);
    this.name = 'LivCostPretransportError';
  }
}

/** OpenAI wraps fetch failures in APIConnectionError.cause. Return the actual
 * branded evidence, not a type assertion on the outer SDK error. Do not revive
 * this evidence from JSON, HTTP bodies, message strings or stored error names.
 * A match permits recording not_started, not bypassing the next budget check.
 */
export function getLivCostPretransportError(error: unknown): LivCostPretransportError | null {
  const seen = new Set<Error>();
  for (let current = error; current instanceof Error && !seen.has(current) && seen.size < 8; current = current.cause) {
    if (current instanceof LivCostPretransportError) return current;
    seen.add(current);
  }
  return null;
}
