import {load} from 'cheerio';

/** DFI's public press room, not all material syndicated through Ritzau. */
export function isLivDfiPressPage(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === 'https://via.ritzau.dk' && !url.username && !url.password && !url.hash &&
      /^\/pressemeddelelse\/[1-9][0-9]{1,11}\/[a-z0-9-]+$/.test(url.pathname) &&
      url.searchParams.getAll('publisherId').length === 1 && url.searchParams.get('publisherId') === '13560928' &&
      [...url.searchParams].every(([key,value]) => key === 'publisherId' || (key === 'lang' && value === 'da'));
  } catch { return false; }
}

/** Exact download links in the same one-image, credited gallery figure.
 * No thumbnail URL synthesis, footer attribution or assertion of reuse rights. */
export function extractLivDfiPressPhotos(html: string, pageUrl: string): Array<{url:string;credit:string}> {
  if (!isLivDfiPressPage(pageUrl) || Buffer.byteLength(html) > 1_000_000) return [];
  const $ = load(html), page = new URL(pageUrl), releaseId = page.pathname.split('/')[2];
  const publisher = $('[data-cypress="release-header"] a[href="/nyhedsrum/13560928/det-danske-filminstitut"]');
  if (publisher.length !== 1) return [];
  const found = new Map<string, Set<string>>();
  $('figure').slice(0, 40).each((_, node) => {
    const figure = $(node), image = figure.find('img'), links = figure.children('a.GalleryItem__link[download]');
    if (figure.parents('nav,aside,footer').length || image.length !== 1 || links.length !== 1) return;
    const captions = figure.children('figcaption');
    if (captions.length !== 2) return;
    const caption = captions.eq(0).text().replace(/\s+/g,' ').trim();
    const supplied = captions.eq(1).children('strong');
    if (supplied.length !== 1) return;
    const rightsholder = supplied.text().replace(/\s+/g,' ').trim();
    const photo = caption.match(/\b(?:Foto|Photo|Credit):\s*([\p{L}\p{M}\p{N} .,’'&/()-]{2,150})$/iu)?.[0];
    if (!photo && !rightsholder) return;
    if (rightsholder && !/^[\p{L}\p{M}\p{N} .,’'&/()-]{2,150}$/u.test(rightsholder)) return;
    try {
      const url = new URL(links.attr('href') || '',pageUrl), thumb = new URL(image.attr('src') || '',pageUrl);
      if ([url,thumb].some(u => u.origin !== page.origin || u.username || u.password || u.search || u.hash) ||
          !new RegExp(`^/files/13560928/${releaseId}/[1-9][0-9]{1,11}/da$`).test(url.pathname) ||
          !new RegExp(`^/data/images/public/13560928/${releaseId}/[a-f0-9-]{36}-w_[0-9]{2,4}\\.(?:jpg|jpeg|png|webp)$`).test(thumb.pathname)) return;
      const credit = photo ? `${photo}${rightsholder ? ` / ${rightsholder}` : ''}` : `Pressebillede: ${rightsholder}`;
      const credits = found.get(url.href) || new Set<string>();
      credits.add(credit); found.set(url.href,credits);
    } catch { /* An unavailable/ambiguous source never becomes an approved image. */ }
  });
  return [...found].filter(([,credits]) => credits.size === 1).slice(0,6).map(([url,credits]) => ({url,credit:[...credits][0]}));
}
