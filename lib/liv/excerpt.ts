import { load } from 'cheerio';

const sentenceEnd = /[.!?…][»”’"')\]]*$/u;
function plain(value: string) {
  const $ = load(value || '');
  $('script, style, iframe, noscript').remove();
  $('p, div, h1, h2, h3, li, br').prepend(' ');
  return $.root().text().replace(/\s+/g, ' ').trim();
}

/** Deterministic plain-text excerpt. Saved text is never mutated. A source
 * sidecar identifies a legacy cut inside a word without inventing its ending. */
export function livExcerpt(value: string, limit = 220, options: { sourceText?: string; truncated?: boolean } = {}): string {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('liv_excerpt_limit_invalid');
  const text = plain(value), source = options.sourceText ? plain(options.sourceText) : '';
  const sourceContinues = source.startsWith(text) && source.length > text.length;
  const legacyCut = !sentenceEnd.test(text) && (options.truncated || sourceContinues);
  if (!text || (text.length <= limit && !legacyCut)) return text;
  const sentences = [...text.matchAll(/[.!?][»”’"')\]]*(?=\s|$)/gu)];
  const last = sentences.filter(match => match.index! + match[0].length <= limit).at(-1);
  if (last) return text.slice(0, last.index! + last[0].length);
  const boundary = Math.min(text.length, limit - 1);
  let prefix = text.slice(0, boundary);
  const next = boundary < text.length ? text[boundary] : sourceContinues ? source[boundary] : '';
  // No source means a known legacy cut's final token cannot be proved complete.
  if ((/\S$/u.test(prefix) && /\S/u.test(next)) || (legacyCut && !sourceContinues && boundary === text.length)) {
    prefix = prefix.replace(/\S+$/u, '');
  }
  return `${prefix.trimEnd().replace(/[,;:…]+$/u, '').trimEnd()}…`;
}
