import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import sharp from 'sharp';
import { sourceUrl } from '@/lib/factcheck/source-reader';
import { extractCandidateImagesFromHtml } from '@/lib/liv/fetch-official-images';
import { extractLivPhotoCredit } from '@/lib/liv/photo-credit';
import { readPressMedia, type PublicMediaResponse } from '@/lib/liv/public-media-reader';

export const PRESS_POLICY = 'press-raster-v2';
export const bytesHash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
type Extracted = { url: string; caption: string; credit: string | null; evidence: string };

/** Source markup is data, never instructions or a licence. Prefer actual
 * original links / largest responsive variant; never manufacture a file URL. */
export function extractPressCandidates(html: string, pageUrl: string) {
  const $ = load(html), candidates: Extracted[] = [], skipped: { url: string; reason: string }[] = [];
  const add = (raw: string | undefined, caption = '', evidence = '') => {
    if (!raw || /^(?:data:|javascript:|#)/i.test(raw)) return;
    try {
      const url = sourceUrl(new URL(raw, pageUrl).href).href;
      if (/\.(?:zip|pdf)(?:\?|$)/i.test(url)) { skipped.push({ url, reason: 'archive_or_document_not_raster' }); return; }
      if (candidates.some(c => c.url === url)) return;
      const credit = caption.match(/(?:\b(?:foto(?:grafi)?|photo(?:graph)?|credit)\s*:\s*|©\s*)(.{2,180})$/iu)?.[1]?.trim() || extractLivPhotoCredit(html, url, pageUrl);
      candidates.push({ url, caption, credit, evidence });
    } catch { /* Invalid/public-network URLs are never candidates. */ }
  };
  $('img').each((_, node) => {
    const image = $(node);
    if (image.closest('header,nav,footer,aside').length) return;
    const alt = image.attr('alt') || '';
    if (/\blogo\b|watermark|vandmærke/iu.test(alt)) return;
    const wrapper = image.closest('figure,.wp-caption');
    const block = image.closest('.image-block');
    const caption = (wrapper.find('figcaption,.wp-caption-text').first().text() ||
      (block.find('img').length === 1 ? block.find('p').filter((_, p) => !$(p).find('img,a').length).first().text() : '') || alt).replace(/\s+/gu, ' ').trim().slice(0, 1000);
    const href = image.closest('a').attr('href');
    if (href && /\.(?:zip|pdf)(?:\?|$)/i.test(href)) add(href);
    const srcsets = [image.attr('data-srcset'), image.attr('srcset'), ...image.closest('picture').find('source').map((_, el) => $(el).attr('data-srcset') || $(el).attr('srcset') || '').get()];
    const variants = srcsets.flatMap(set => (set || '').split(',').map(part => {
      const [url, size] = part.trim().split(/\s+/u); return { url, size: Number.parseFloat(size) || 0 };
    })).filter(v => v.url).sort((a, b) => b.size - a.size);
    const original = href && /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(href) ? href : variants[0]?.url || image.attr('data-src') || image.attr('data-lazy-src') || image.attr('src');
    add(original, caption, wrapper.length ? 'image_caption' : 'image_block_or_alt');
  });
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (href && /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(href) && !$(a).closest('nav,footer,header').length) add(href, '', 'image_link');
  });
  // Metadata remains an unverified candidate until byte validation; schema @id
  // can point at an HTML homepage, as in the Kontrapunkt regression.
  for (const url of extractCandidateImagesFromHtml(html, pageUrl)) add(url, '', 'metadata_or_legacy_gallery');
  const usageTerms = $('main p,article p').map((_, p) => $(p).text().replace(/\s+/gu, ' ').trim())
    .get().filter(text => text.length <= 1200 && /(?:billeder|fotos|images|photos).{0,100}(?:benytt|bruges|anvend|use|licen)|(?:licen|rettighed|copyright).{0,100}(?:billeder|fotos|images|photos)/iu.test(text)).slice(0, 8);
  return { candidates, skipped: skipped.slice(0, 32), usageTerms };
}

export async function validatePressRaster(response: PublicMediaResponse) {
  if (response.status !== 200 || !response.bytes.length || response.bytes.length > 24 * 1024 * 1024) throw Error('press_image_empty_or_size');
  try {
    const image = sharp(response.bytes, { limitInputPixels: 40_000_000, failOn: 'warning' });
    const meta = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format || '') || (meta.pages || 1) !== 1 ||
      (meta.width || 0) < 800 || (meta.height || 0) < 500) throw Error('invalid_dimensions');
    const mimeType = `image/${meta.format}`;
    if (response.contentType !== mimeType) throw Error('mime_mismatch');
    // metadata() alone accepts truncated files. Decode ALL raster rows, bounded
    // to 40MP; no edited output is stored or substituted for the original.
    await image.stats();
    return { mimeType, byteCount: response.bytes.length, width: meta.width!, height: meta.height!, sha256: bytesHash(response.bytes) };
  } catch { throw Error('press_image_decode_or_mime_invalid'); }
}

export async function downloadVerifiedPressImage(candidate: { originalUrl: string; sha256: string }) {
  const response = await readPressMedia(candidate.originalUrl, 'image');
  const validation = await validatePressRaster(response);
  if (validation.sha256 !== candidate.sha256) throw Error('mcp_submission_press_source_changed');
  return { response, validation };
}
