export type SubtitleFit = { text: string; source: 'original' | 'chatgpt' | 'excerpt'; readable: boolean; truncated: boolean };

/** Automatic card-only fitting, not a model rewrite. Prefer prepared ChatGPT
 * copy, then preserve as much of the original as fits. No invented facts.
 */
export function fitSubtitleAutomatically(original: string, prepared: string | undefined, fits: (text: string) => boolean): SubtitleFit {
  if (prepared?.trim() && fits(prepared.trim())) return { text: prepared.trim(), source: 'chatgpt', readable: true, truncated: false };
  const text = original.trim();
  if (!text || fits(text)) return { text, source: 'original', readable: true, truncated: false };
  if (typeof Intl.Segmenter === 'function') {
    let best = '';
    for (const segment of new Intl.Segmenter('da', { granularity: 'sentence' }).segment(text)) {
      const candidate = text.slice(0, segment.index + segment.segment.length).trim();
      if (candidate.length < text.length && /[.!?][”"’'»)]*$/.test(candidate) && !/…|\.{3}/.test(candidate) && fits(candidate)) best = candidate;
    }
    if (best) return { text: best, source: 'excerpt', readable: true, truncated: false };
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
