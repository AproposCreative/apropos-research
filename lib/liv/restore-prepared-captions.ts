import { load } from 'cheerio';

/** Restore only caption text, keeping Webflow's image URLs, attributes and prose.
 * This produces a scoped candidate, not publication approval. Byte/alt/order
 * verification still runs against the canonical payload after CMS saving. */
export function restorePreparedCaptions(cmsHtml: string, preparedHtml: string): string {
  const cms = load(cmsHtml), prepared = load(preparedHtml);
  const captions = prepared('figcaption').toArray();
  const current = cms('figcaption').toArray();
  const images = cms('img').toArray(), originals = prepared('img').toArray();
  if (captions.length !== 2 || current.length !== 2 || images.length !== 2 || originals.length !== 2 ||
    images.some((image, index) => cms(image).attr('alt') !== prepared(originals[index]).attr('alt')) ||
    captions.some(caption => !/(?:foto|illustration|kilde|credit)\s*:|©/i.test(prepared(caption).text()))) {
    throw new Error('liv_presentation_caption_conflict');
  }
  const prose = (html: string) => {
    const $ = load(html);
    $('figcaption').remove();
    $('p,div,h1,h2,h3,h4,h5,h6,li,blockquote,figure,br').each((_, e) => { $(e).before(' ').after(' '); });
    return $('body').text().replace(/\s+/gu, ' ').trim();
  };
  if (prose(cmsHtml) !== prose(preparedHtml)) throw new Error('liv_presentation_caption_conflict');
  for (let i = 0; i < 2; i++) {
    if (cms(current[i]).closest('figure').find('img')[0] !== images[i] ||
      prepared(captions[i]).closest('figure').find('img')[0] !== originals[i]) {
      throw new Error('liv_presentation_caption_conflict');
    }
    cms(current[i]).text(prepared(captions[i]).text());
  }
  return cms('body').html()!;
}
