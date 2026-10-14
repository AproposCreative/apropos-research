/** Public messages only: never show provider payloads/credentials to the browser. */
export function writerBudgetMessage(code: string): string {
  if (code === 'liv_cost_provider_quota_exhausted') return 'AI Writer er midlertidigt stoppet, fordi den fælles API-konto mangler credits. Dine noter og samtalen er bevaret. Frederik skal genåbne forbindelsen; gentagne forsøg hjælper ikke.';
  if (code === 'liv_cost_manual_writer_budget_exceeded') return 'Writers engangsloft på 50 kr. er nået eller optaget af igangværende kald. Dine noter og samtalen er bevaret. Budgettet fyldes ikke automatisk op.';
  if (code === 'liv_cost_manual_writer_only') return 'Betalt AI er kun åbnet for manuel Writer. Liv og SEO fortsætter i ChatGPT.';
  return 'AI Writer er stoppet af budgetkontrollen før afsendelse. Dine noter og samtalen er bevaret. Frederik skal kontrollere opsætningen, før du prøver igen.';
}
