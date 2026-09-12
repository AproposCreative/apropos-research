import { load } from 'cheerio';

/** Publicly reproduced TV 2 stills, not an assertion that the publisher owns
 * them or that reuse rights were verified. Only exact, captioned assets. */
export function isLivSyndicatedPressPage(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === 'https://soundvenue.com' && !url.username && !url.password && !url.search && !url.hash &&
      /^\/film\/\d{4}\/\d{2}\/[a-z0-9-]+$/.test(url.pathname);
  } catch { return false; }
}

export function extractLivSyndicatedPressPhotos(html: string, pageUrl: string): Array<{url: string; credit: string}> {
  if (!isLivSyndicatedPressPage(pageUrl) || Buffer.byteLength(html) > LIV_TUDUM_HTML_MAX_BYTES) return [];
  const $ = load(html), photos = new Map<string, string>();
  $('figure').slice(0, 40).each((_, node) => {
    const figure = $(node);
    if (figure.parents('nav,aside,footer').length || figure.find('img').length !== 1 || figure.find('figcaption').length !== 1) return;
    const match = figure.find('figcaption').text().replace(/\s+/g, ' ').trim()
      .match(/\(Foto:\s*([\p{L} .’'-]{2,100})\s*\/\s*TV 2\)\s*$/u);
    if (!match) return;
    try {
      const url = new URL(figure.find('img').attr('src') || '', pageUrl);
      if (url.origin !== 'https://soundvenue.com' || url.username || url.password || url.search || url.hash ||
        !/^\/wp-content\/uploads\/\d{4}\/\d{2}\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(url.pathname)) return;
      photos.set(url.href, `Foto: ${match[1].trim()}/TV 2`);
    } catch { /* Not a usable public asset. */ }
  });
  return [...photos].slice(0, 6).map(([url, credit]) => ({url, credit}));
}

export const LIV_TUDUM_HTML_MAX_BYTES = 4 * 1024 * 1024;
/** Netflix's editorial article namespace only, not arbitrary Netflix subdomains/pages. */
export function isLivTudumSource(pageUrl: string): boolean {
  try {
    const url = new URL(pageUrl);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['www.netflix.com', 'netflix.com'].includes(url.hostname) && /^\/tudum\/articles\/[a-z0-9-]+\/?$/.test(url.pathname);
  } catch { return false; }
}

/** Exact rendered asset URLs only. Never equate different CDN transformations. */
export function extractLivTudumPhotos(html: string, pageUrl: string): Array<{ url: string; credit: string }> {
  if (!isLivTudumSource(pageUrl) || Buffer.byteLength(html) > LIV_TUDUM_HTML_MAX_BYTES) return [];
  const $ = load(html), found = new Map<string, Set<string>>();
  const add = (raw: string | undefined, rawCredit: string) => {
    if (!raw) return;
    const match = rawCredit.replace(/\s+/g, ' ').trim().match(/^PHOTO BY ([\p{L}\p{N} .,'’&/()-]{2,180})$/iu);
    if (!match) return;
    try {
      const url = new URL(raw, pageUrl);
      if (url.origin !== 'https://dnm.nflximg.net' || url.username || url.password || url.hash ||
          !/^\/api\/v6\/[a-z0-9_-]+\/[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(url.pathname) ||
          [...url.searchParams].some(([key, value]) => key !== 'r' || !/^[a-f0-9]{1,12}$/i.test(value))) return;
      const credits = found.get(url.href) || new Set<string>();
      credits.add(`Foto: ${match[1].trim()}`); found.set(url.href, credits);
    } catch { /* Invalid asset is not a source. */ }
  };
  // Hero credit is a direct sibling of its one-image semantic container.
  $('[data-uia="image-container"]').slice(0, 20).each((_, node) => {
    const container = $(node), parent = container.parent(), images = container.find('img');
    const credits = parent.children('[data-uia="image-credit"]');
    if (container.parents('footer,nav,aside').length || parent.children('[data-uia="image-container"]').length !== 1 ||
        parent.find('img').length !== 1 || images.length !== 1 || credits.length !== 1) return;
    add(images.attr('src') || images.attr('data-src'), credits.text());
  });
  // Each gallery picture has its OWN media-details sibling. Never climb to
  // the multi-photo gallery, article body, footer or unrelated recommendation.
  $('[data-sel="media-card"][data-content-type="inlineImageCollection"] picture').slice(0, 80).each((_, node) => {
    const picture = $(node), parent = picture.parent(), details = parent.children('[data-uia="media-details"]');
    if (picture.parents('header,footer,nav,aside').length || parent.find('img').length !== 1 ||
        parent.children('picture').length !== 1 || details.length !== 1) return;
    const credits = details.children('div').filter((_, child) => $(child).children().length === 0 && /^PHOTO BY /i.test($(child).text().trim()));
    if (credits.length !== 1) return;
    const image = picture.find('img');
    add(image.attr('src') || image.attr('data-src'), credits.text());
  });
  return [...found].filter(([, credits]) => credits.size === 1).slice(0, 12)
    .map(([url, credits]) => ({ url, credit: [...credits][0] }));
}

/** A source-selection policy, not a licence assertion or a URL-fetch permission. */
export function isLivOfficialImageSource(pageUrl: string): boolean {
  // This narrowly trusted editorial source survives production host overrides.
  if (isLivTudumSource(pageUrl)) return true;
  const hosts = (process.env.LIV_OFFICIAL_IMAGE_HOSTS || 'sfstudios.dk,sfstudios.com,a24films.com,nordiskfilm.dk,distribution.paradisbio.dk,tivoli.dk,goldendays.dk')
    .split(',').map(host => host.trim().toLowerCase()).filter(host => /^[a-z0-9.-]+\.[a-z]+$/.test(host));
  try {
    const host = new URL(pageUrl).hostname.toLowerCase();
    return hosts.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
  } catch { return false; }
}

/** Only a credit attached to this exact image; never the site's generic footer. */
export function extractLivPhotoCredit(html: string, imageUrl: string, pageUrl: string): string | null {
  if (isLivTudumSource(pageUrl)) {
    try { return extractLivTudumPhotos(html, pageUrl).find(photo => photo.url === new URL(imageUrl, pageUrl).href)?.credit || null; }
    catch { return null; }
  }
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
