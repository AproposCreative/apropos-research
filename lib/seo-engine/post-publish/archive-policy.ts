/** Event-driven reviews remain enabled. Recovery discovers only recently
 * published/republished content, never pays to sweep the unchanged archive. */
export function recentPublication(value: unknown, now = new Date()): boolean {
  if (typeof value !== 'string') return false;
  const age = now.getTime() - Date.parse(value);
  return Number.isFinite(age) && age >= 0 && age <= 72 * 60 * 60_000;
}
