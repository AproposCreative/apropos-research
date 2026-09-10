import { load } from 'cheerio';

/** A source-selection policy, not a licence assertion or a URL-fetch permission. */
export function isLivOfficialImageSource(pageUrl: string): boolean {
  const hosts = (process.env.LIV_OFFICIAL_IMAGE_HOSTS || 'sfstudios.dk,sfstudios.com,a24films.com,nordiskfilm.dk')
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
  return null;
}
