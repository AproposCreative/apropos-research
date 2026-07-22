import type { ConfidenceBand, RawConfidence } from '@/lib/seo-engine/schema';

export type ConfidenceBandInput = {
  raw: RawConfidence;
  evidenceCount: number;
  hasConflict: boolean;
  missingFactCount: number;
  inputMode: 'full' | 'long_article_extract';
};

export type ConfidenceBandResult = {
  band: ConfidenceBand;
  score: number;
  reasons: string[];
};

/**
 * UI band from model raw confidence + deterministic penalties.
 * Raw is stored separately; UI must not present raw as calibrated probability.
 */
export function toConfidenceBand(args: ConfidenceBandInput): ConfidenceBandResult {
  let score = args.raw;
  const reasons: string[] = [];

  if (args.evidenceCount === 0) {
    score -= 0.2;
    reasons.push('Ingen evidence-citater');
  }
  if (args.hasConflict) {
    score -= 0.15;
    reasons.push('Konflikt i artikeltype/entitet');
  }
  if (args.missingFactCount > 0) {
    const pen = Math.min(0.25, 0.05 * args.missingFactCount);
    score -= pen;
    reasons.push('Manglende fakta');
  }
  if (args.inputMode === 'long_article_extract') {
    score -= 0.1;
    reasons.push('Long-article extract');
  }

  score = Math.max(0, Math.min(1, score));
  const band: ConfidenceBand = score >= 0.75 ? 'high' : score >= 0.45 ? 'medium' : 'low';
  return { band, score, reasons };
}
