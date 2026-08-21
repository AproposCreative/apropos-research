/**
 * Filter English CMS translations out of the public podcast RSS.
 * Matches the heuristics used in the iOS Firebase notificationPolicy.
 */

const DANISH_HINT_RE =
  /\b(og|på|ikke|også|eller|når|være|skal|kunne|bliver|kommer|artikel|anmeldelse|koncerten|festivalen|danske|dansk|lyt|magazinets?)\b|[æøåÆØÅ]/iu;

const ENGLISH_HINT_RE =
  /\b(the|and|with|for|from|this|that|was|were|are|have|has|been|will|would|their|about|into|after|before|review|festival|concert|article|published|available|community|maritime|vibe|vibes)\b/i;

export function isEnglishPodcastEpisode(input: {
  articleSlug?: string;
  title?: string;
  description?: string;
}): boolean {
  const slug = String(input.articleSlug || '')
    .trim()
    .toLowerCase();
  if (slug.endsWith('-en') || slug.includes('-en-') || slug.startsWith('en/')) {
    return true;
  }

  // Common Webflow EN slug patterns for Apropos translations.
  // Do not treat transliterations like "oe"/"aa" as Danish — "oehavet" is øhavet.
  if (
    /-(community|maritime|folk-high-school|vibes?)(-|$)/.test(slug) ||
    /-(and|with|for)-/.test(slug)
  ) {
    return true;
  }

  const sample = [input.title, input.description].filter(Boolean).join(' ').slice(0, 5000);
  if (!sample) return false;

  const hasDanish = DANISH_HINT_RE.test(sample);
  const hasEnglish = ENGLISH_HINT_RE.test(sample);
  return hasEnglish && !hasDanish;
}
