import { load } from 'cheerio';

/** Ignore CMS serialization whitespace, never changed prose or asset targets. */
export function cmsBodyEvidence(html: string) {
  const $ = load(html);
  const targets = $('a,img,iframe,video,audio,source').toArray().map(element => {
    const node = $(element);
    return { tag: String(node.prop('tagName') || '').toLowerCase(), href: node.attr('href') || '', src: node.attr('src') || '',
      srcset: node.attr('srcset') || '', poster: node.attr('poster') || '', alt: node.attr('alt') || '' };
  });
  $('script,style').remove();
  $('p,div,h1,h2,h3,h4,h5,h6,li,blockquote,figure,figcaption,br,hr,tr,td,th').each((_, element) => {
    $(element).before(' ').after(' ');
  });
  return { text: $('body').text().replace(/\s+/gu, ' ').trim(), targets };
}

export function sameCmsBody(expected: string, stored: string): boolean {
  const wanted = cmsBodyEvidence(expected);
  return !!wanted.text && JSON.stringify(wanted) === JSON.stringify(cmsBodyEvidence(stored));
}
