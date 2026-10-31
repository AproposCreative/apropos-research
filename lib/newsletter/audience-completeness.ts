// A short, well-formed raw API page is the only legacy terminal proof.
// A full page at the cap is deliberately NOT proof that enumeration ended.
export function audiencePageProof(payload: unknown, field: string, limit: number) {
  const value = payload as Record<string, unknown> | null;
  const rows = value && typeof value === 'object' && !Array.isArray(value) ? value[field] : undefined;
  const valid = Array.isArray(rows) && rows.length <= limit;
  return { valid, terminal: valid && rows.length < limit };
}
