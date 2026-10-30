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
  language?: string;
}): boolean {
  const language = input.language?.trim().toLowerCase();
  if (language === 'da' || language?.startsWith('da-')) return false;
  if (language === 'en' || language?.startsWith('en-')) return true;
  const slug = String(input.articleSlug || '')
    .trim()
    .toLowerCase();
  if (slug.endsWith('-en') || slug.startsWith('en/')) {
    return true;
  }

  // Common Webflow EN slug patterns for Apropos translations.
  // Do not treat transliterations like "oe"/"aa" as Danish — "oehavet" is øhavet.
  if (
    /-(community|maritime|folk-high-school|vibes?)(-|$)/.test(slug) ||
    /-(and|with)-/.test(slug)
  ) {
    return true;
  }

  // "en" and "for" are ordinary Danish words, including Syd for Solen.
  // Keep explicit translation markers; never use these two words as markers.
  const sample = [input.title, input.description].filter(Boolean).join(' ').slice(0, 5000);
  if (!sample || DANISH_HINT_RE.test(sample)) return false;

  const hasEnglish = ENGLISH_HINT_RE.test(sample);
  return hasEnglish;
}
