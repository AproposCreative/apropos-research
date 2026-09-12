import { load } from 'cheerio';
import { z } from 'zod';
import type { GeneratedArticle } from '@/lib/liv/generate-article';

const text = (max: number) => z.string().min(1).max(max).refine(value =>
  !!value.trim() && !/[<>\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(value) &&
  !/(?:https?:\/\/|javascript:|data:)/i.test(value));
const schema = z.object({ corrections: z.array(z.object({
  role: z.enum(['hero', 'body-1', 'body-2']), alt: text(240), caption: text(400),
}).strict()).min(1).max(3) }).strict();
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const invalid = (): never => { throw new Error('liv_media_description_invalid'); };
type Span = { startOffset: number; endOffset: number };
// The repository's legacy Cheerio declarations omit parse5's runtime locations.
type LocatedNode = { sourceCodeLocation?: Span & {
  attrs?: Record<string, Span>; startTag?: Span; endTag?: Span;
} };

/** Description-only repair. No new visual approval or article-hash rebinding. */
export function applyLivMediaDescriptionCorrections(article: GeneratedArticle, value: unknown): GeneratedArticle {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return invalid();
  const corrections = parsed.data.corrections;
  const media = article.preparedMedia;
  if (!media?.length || new Set(corrections.map(item => item.role)).size !== corrections.length ||
      new Set(media.map(item => item.role)).size !== media.length ||
      media.some(item => !['hero', 'body-1', 'body-2'].includes(item.role))) return invalid();
  let malformed = false;
  const parserOptions = { xmlMode: false, sourceCodeLocationInfo: true,
    onParseError: (error: { code: string }) => { if (error.code === 'duplicate-attribute') malformed = true; } };
  const $ = load(article.content, parserOptions);
  if (malformed) return invalid();
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const revised = { ...article, preparedMedia: [...media] };
  for (const correction of corrections) {
    const index = media.findIndex(item => item.role === correction.role);
    if (index < 0) return invalid();
    const image = media[index];
    if (image.alt === correction.alt && image.caption === correction.caption) return invalid();
    // The existing AI disclosure is not a description the model may remove.
    if (/^AI-illustration:/i.test(image.caption) && !/^AI-illustration:/i.test(correction.caption)) return invalid();
    if (correction.role === 'hero') {
      const hero = article.selectedImage;
      if (!hero || hero.url !== image.url || hero.contentHash !== image.contentHash || hero.alt !== image.alt) return invalid();
      revised.selectedImage = { ...hero, alt: correction.alt };
    } else {
      const figure = $(`figure[data-liv-media="${correction.role}"]`);
      const img = figure.children('img');
      const caption = figure.children('figcaption');
      const credit = /^(?:foto|illustration|kilde|credit)\s*:|^©/i.test(image.credit) ? image.credit : `Foto: ${image.credit}`;
      if (figure.length !== 1 || img.length !== 1 || caption.length !== 1 ||
          figure.find('img').length !== 1 || caption.children().length || !image.credit.trim() ||
          img.attr('src') !== image.url || img.attr('alt') !== image.alt ||
          img.attr('width') !== String(image.width) || img.attr('height') !== String(image.height) ||
          caption.text() !== `${image.caption} ${credit}`) return invalid();
      const imgLocation = (img[0] as unknown as LocatedNode).sourceCodeLocation;
      const altLocation = imgLocation?.attrs?.alt;
      const captionLocation = (caption[0] as unknown as LocatedNode).sourceCodeLocation;
      if (!altLocation || !captionLocation?.startTag || !captionLocation.endTag) return invalid();
      replacements.push({ start: altLocation.startOffset, end: altLocation.endOffset,
        text: `alt="${escape(correction.alt)}"` },
      { start: captionLocation.startTag.endOffset, end: captionLocation.endTag.startOffset,
        text: `${escape(correction.caption)} ${escape(credit)}` });
    }
    revised.preparedMedia[index] = { ...image, alt: correction.alt, caption: correction.caption };
  }
  // Use original source offsets: never reserialize unrelated prose or asset attributes.
  let end = article.content.length;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    if (replacement.end > end || replacement.start >= replacement.end) return invalid();
    revised.content = revised.content.slice(0, replacement.start) + replacement.text + revised.content.slice(replacement.end);
    end = replacement.start;
  }
  return revised;
}
