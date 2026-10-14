import { load } from 'cheerio';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';

/** Compare all non-media fields and the actual ordered prose DOM, including
 * links/emphasis/whitespace. Only image markup/captions are excluded. Cheerio's
 * stable serialization avoids false changes from inserting a figure. */
export function imageProtectedContentHash(article: Record<string, unknown>) {
  const { content, featuredImage: _cover, featuredImageAlt: _alt, fotoCredit: _credit, ...metadata } = article;
  const $ = load(String(content || ''));
  $('img,figcaption').remove();
  $('figure').each((_, el) => { $(el).replaceWith($(el).contents()); });
  return cmsFieldHash({ metadata, prose: $('body').html() || '' });
}
export function assertImageContentInvariant(before: Record<string, unknown>, after: Record<string, unknown>, expected: string) {
  if (imageProtectedContentHash(before) !== expected || imageProtectedContentHash(after) !== expected)
    throw Error('mcp_submission_image_content_changed');
}
