import type { FundingOpportunity } from '@/lib/funding/types';

export function scoreFundingOpportunity(opp: FundingOpportunity): number {
  return Math.round(
    opp.fitScore * 0.4 + opp.urgencyScore * 0.35 - opp.riskScore * 0.1 - (opp.duplicateRisk || 0) * 0.15
  );
}
