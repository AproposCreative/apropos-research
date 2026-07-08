export function normalizeFundingText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9æøå\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fundingSlug(input: string): string {
  return normalizeFundingText(input).replace(/\s+/g, '-').slice(0, 80) || `opp-${Date.now().toString(36)}`;
}

export function dedupeKey(title: string, funder: string): string {
  return `${normalizeFundingText(funder)}::${normalizeFundingText(title)}`;
}
