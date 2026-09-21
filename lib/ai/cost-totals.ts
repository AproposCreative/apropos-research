/** Shared validation/projection; reservations are not spend and unknown usage is not free. */
export function costTotals(value: unknown) {
  const row = value as Record<string, unknown> | undefined;
  if (!row || !['committedDkkMicros', 'reservedDkkMicros', 'calls'].every(key =>
    Number.isSafeInteger(row[key]) && Number(row[key]) >= 0)) throw new Error('cost_totals_invalid');
  return { estimatedDkk: Number(row.committedDkkMicros) / 1e6, reservedDkk: Number(row.reservedDkkMicros) / 1e6,
    trackedCalls: Number(row.calls) };
}
