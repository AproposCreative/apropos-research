/** Forbidden / generic AI SEO phrases (Danish + common EN bleed). */

export const FORBIDDEN_SEO_PHRASES: string[] = [
  'alt du skal vide',
  'den ultimative guide',
  'dyk ned i',
  'i denne artikel ser vi nærmere på',
  'det er værd at bemærke',
  'en oplevelse ud over det sædvanlige',
  'tager publikum med på en rejse',
  'leverer en stærk præstation',
  'et must-see',
  'must-see',
  'du vil ikke gå glip af',
  'her får du svaret',
  'unlock the secrets',
  'in this article we',
  'delve into',
];

export function findForbiddenPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return FORBIDDEN_SEO_PHRASES.filter((p) => lower.includes(p));
}
