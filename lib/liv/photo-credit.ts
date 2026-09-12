import { load } from 'cheerio';

/** A source-selection policy, not a licence assertion or a URL-fetch permission. */
export function isLivOfficialImageSource(pageUrl: string): boolean {
  const hosts = (process.env.LIV_OFFICIAL_IMAGE_HOSTS || 'sfstudios.dk,sfstudios.com,a24films.com,nordiskfilm.dk,distribution.paradisbio.dk,tivoli.dk,goldendays.dk')
    .split(',').map(host => host.trim().toLowerCase()).filter(host => /^[a-z0-9.-]+\.[a-z]+$/.test(host));
  try {
    const host = new URL(pageUrl).hostname.toLowerCase();
    return hosts.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
  } catch { return false; }
}

/** Only a credit attached to this exact image; never the site's generic footer. */
export function extractLivPhotoCredit(html: string, imageUrl: string, pageUrl: string): string | null {
  const $ = load(html);
  const absolute = (value?: string) => { try { return new URL(value || '', pageUrl).href; } catch { return ''; } };
  for (const node of $('img').toArray()) {
    const image = $(node);
    if (![image.attr('src'), image.attr('data-src')].some(url => url && absolute(url) === imageUrl)) continue;
    const caption = image.closest('figure').find('figcaption').text().replace(/\s+/g, ' ').trim();
    const match = caption.match(/(?:\b(?:foto(?:grafi)?|photo(?:graph)?|credit)\s*:\s*|©\s*)(.{2,180})$/i);
    if (match && !/[<>\x00-\x1f]/.test(match[1])) return match[0];
  }
  // A distributor's exact film press-download link proves the source, not the
  // photographer or a licence. Never invent a photographer from the site footer.
  if (isParadisPressStill(imageUrl, pageUrl) && $('a[href]').toArray().some(node =>
      absolute($(node).attr('href')) === imageUrl)) return 'Pressebillede: Øst for Paradis';
  return null;
}

export function isParadisPressStill(imageUrl: string, pageUrl: string): boolean {
  try {
    const page = new URL(pageUrl), image = new URL(imageUrl), id = page.searchParams.get('id');
    return [page, image].every(url => url.origin === 'https://distribution.paradisbio.dk' &&
      !url.username && !url.password && !url.port && !url.hash) && page.pathname === '/film.asp' &&
      page.searchParams.size === 1 && !!id && /^[1-9][0-9]{0,5}$/.test(id) && !image.search &&
      new RegExp(`^/log/film/[^/]+ \\(${id}\\)/[^/]+_[0-9]{2}\\.jpg$`).test(decodeURIComponent(image.pathname));
  } catch { return false; }
}
