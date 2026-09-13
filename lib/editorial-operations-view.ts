/** Pure display formatting; unknown ledger values must never become zero. */
export function operationsBudgetLabel(budget: {
  usageBasedUpperDkk?: number | null; monthlyLimitDkk?: number;
} | null | undefined): string {
  if (!budget) return 'Status utilgængelig';
  const usage = budget.usageBasedUpperDkk;
  if (typeof usage !== 'number' || !Number.isFinite(usage) || usage < 0) {
    return 'Registreret forbrug er endnu ukendt.';
  }
  const amount = usage.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const limit = budget.monthlyLimitDkk;
  return typeof limit === 'number' && Number.isFinite(limit) && limit > 0
    ? `${amount} kr. registreret af ${limit.toLocaleString('da-DK')} kr.`
    : `${amount} kr. registreret. Budgetgrænsen er ukendt.`;
}
