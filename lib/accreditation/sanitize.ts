/**
 * Global Liv output sanitation — applied to subjects, text, and HTML before send/store.
 * Em dash (U+2014) and en dash (U+2013) must never appear in Liv output.
 */
const EM_DASH = '\u2014'; // —
const EN_DASH = '\u2013'; // –

export function sanitizeLivOutput(input: string): string {
  if (!input) return input;
  return input
    .split(EM_DASH)
    .join(' - ')
    .split(EN_DASH)
    .join('-')
    .replace(/ {2,}/g, ' ')
    .replace(/ -\s*$/gm, '')
    .replace(/^\s*- /gm, (m) => m); // keep list hyphens
}

export function containsForbiddenDash(input: string): boolean {
  return input.includes(EM_DASH) || input.includes(EN_DASH);
}

/** Ensure subject contains exactly one [LIV-123] (or LIV-HIST-…) marker. */
export function ensureRequestIdInSubject(subject: string, requestId: string): string {
  const id = (requestId || '').trim().toUpperCase();
  if (!id || !/^LIV-(?:HIST-)?\d+$/i.test(id)) {
    return sanitizeLivOutput(subject);
  }
  const marker = `[${id}]`;
  let base = subject.replace(/\s*\[LIV-(?:HIST-)?\d+\]\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  // Also strip bare LIV-123 tokens that are not bracketed, then re-add once
  base = base.replace(/\bLIV-(?:HIST-)?\d+\b/gi, '').replace(/\s+/g, ' ').trim();
  const withId = base.includes(marker) ? base : `${base} ${marker}`.trim();
  return sanitizeLivOutput(withId.replace(/\s+/g, ' ').trim());
}

export function extractBracketRequestId(subject: string): string | null {
  const m = subject.match(/\[(LIV-(?:HIST-)?\d+)\]/i);
  return m ? m[1].toUpperCase() : null;
}
