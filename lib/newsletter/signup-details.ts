export type NewsletterSignup = { email: string; signedUpAt: string | null };
export function signupDate(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}
export function mergeSignups(signups: NewsletterSignup[]): NewsletterSignup[] {
  const found = new Map<string, NewsletterSignup>();
  for (const row of signups) {
    const email = row.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const date = signupDate(row.signedUpAt), prior = found.get(email);
    if (!prior) found.set(email, { email, signedUpAt: date });
    else if (date && (!prior.signedUpAt || date < prior.signedUpAt)) prior.signedUpAt = date;
  }
  return [...found.values()];
}
