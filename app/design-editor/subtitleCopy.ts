export type SubtitleFit = { text: string; source: 'original' | 'chatgpt' | 'ai' | 'excerpt'; readable: boolean; truncated: boolean };

/** A complete adversative clause can retain the review's verdict when its
 * scene-setting lead is too long. Only lift words already present in the
 * subtitle; an elliptical "men ikke ..." clause is not standalone copy. */
function standaloneContrast(sentence: string): string | null {
  const match = sentence.match(/,\s+men\s+([^.!?]+[.!?][”"’'»)]*)$/u);
  if (!match) return null;
  const clause = match[1].trim();
  if (!/^(?:[A-ZÆØÅ][\p{L}\p{N}-]*|jeg|vi|den|det|han|hun|de|serien|filmen|bogen|albummet|koncerten)\s+(?:er|har|bliver|blev|giver|gav|får|fik|mangler|savner|virker|føles|viser|leverer|holder|kan|kunne|vil|ville|skal|skulle)\b/u.test(clause)) return null;
  return clause[0].toLocaleUpperCase('da') + clause.slice(1);
}

/** Automatic card-only fitting, not a model rewrite. Prefer prepared ChatGPT
 * copy, then preserve as much of the original as fits. No invented facts.
 */
export function fitSubtitleAutomatically(original: string, prepared: string | undefined, fits: (text: string) => boolean): SubtitleFit {
  if (prepared?.trim() && fits(prepared.trim())) return { text: prepared.trim(), source: 'chatgpt', readable: true, truncated: false };
  const text = original.trim();
  if (!text || fits(text)) return { text, source: 'original', readable: true, truncated: false };
  if (typeof Intl.Segmenter === 'function') {
    let best = '';
    let firstSentence = '';
    for (const segment of new Intl.Segmenter('da', { granularity: 'sentence' }).segment(text)) {
      const candidate = text.slice(0, segment.index + segment.segment.length).trim();
      if (!firstSentence) firstSentence = segment.segment.trim();
      if (candidate.length < text.length && /[.!?][”"’'»)]*$/.test(candidate) && !/…|\.{3}/.test(candidate) && fits(candidate)) best = candidate;
    }
    if (best) return { text: best, source: 'excerpt', readable: true, truncated: false };
    const contrast = standaloneContrast(firstSentence);
    if (contrast && fits(contrast)) return { text: contrast, source: 'excerpt', readable: true, truncated: false };
  } else {
    const contrast = standaloneContrast(text);
    if (contrast && fits(contrast)) return { text: contrast, source: 'excerpt', readable: true, truncated: false };
  }
  // One long sentence: a visibly abbreviated lead ending on a word boundary.
  const words = text.split(/\s+/);
  let low = 1, high = words.length - 1, best = '';
  while (low <= high) {
    const count = Math.floor((low + high) / 2);
    const candidate = words.slice(0, count).join(' ').replace(/[,:;.!?…]+$/, '') + '…';
    if (fits(candidate)) { best = candidate; low = count + 1; } else high = count - 1;
  }
  if (best) return { text: best, source: 'excerpt', readable: true, truncated: true };
  return { text: original, source: 'original', readable: false, truncated: false };
}
