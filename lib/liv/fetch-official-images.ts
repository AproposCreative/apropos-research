/**
 * Henter kandidat-URL’er til officielle sidebilleder fra HTML:
 * og:image, twitter:image, JSON-LD (schema.org image), link rel="image_src".
 *
 * Bruges til Liv/CMS så thumb kan komme fra festivalens/site’s egne hero-billeder
 * i stedet for AI-genererede fantasibilleder.
 */

import { sourceUrl } from '@/lib/factcheck/source-reader';
import { readPublicMedia } from '@/lib/liv/public-media-reader';
import { load } from 'cheerio';

function absoluteUrl(raw: string, base: string): string | null {
  try {
    return sourceUrl(new URL(raw.trim(), base).href).href;
  } catch {
    return null;
  }
}

function looksLikeNoiseImage(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    /facebook\.com\/tr\?|google-analytics|googletagmanager|\/pixel|\/1x1|blank\.gif|transparent\.gif|spacer/i.test(
      lower
    ) ||
    /favicon|apple-touch-icon/i.test(lower)
  );
}

export function extractCandidateImagesFromHtml(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw?: string | null) => {
    if (!raw || typeof raw !== 'string') return;
    const u = absoluteUrl(raw.split('#')[0], pageUrl);
    if (!u || seen.has(u)) return;
    if (looksLikeNoiseImage(u)) return;
    seen.add(u);
    out.push(u);
  };

  const metaOg = /<meta[^>]*property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/gi;
  const metaOgAlt = /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/gi;
  let m: RegExpExecArray | null;
  while ((m = metaOg.exec(html)) !== null) push(m[1]);
  while ((m = metaOgAlt.exec(html)) !== null) push(m[1]);

  const metaTw =
    /<meta[^>]*name=["']twitter:image(?::src|:url)?["'][^>]*content=["']([^"']+)["']/gi;
  const metaTwAlt =
    /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src|:url)?["']/gi;
  while ((m = metaTw.exec(html)) !== null) push(m[1]);
  while ((m = metaTwAlt.exec(html)) !== null) push(m[1]);

  const linkImg = /<link[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/gi;
  const linkImgAlt = /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']image_src["']/gi;
  while ((m = linkImg.exec(html)) !== null) push(m[1]);
  while ((m = linkImgAlt.exec(html)) !== null) push(m[1]);

  extractImagesFromLdJson(html, pageUrl).forEach((u) => push(u));

  // Include press/gallery stills, not just the page's single social thumbnail.
  // Credit and relevance are independently checked before automatic selection.
  const $ = load(html);
  $('figure:has(figcaption) img').each((_, node) => {
    if ($(node).parents('header,footer,nav,aside').length) return;
    push($(node).attr('data-src') || $(node).attr('src'));
  });

  return out;
}

function extractImagesFromLdJson(html: string, pageUrl: string): string[] {
  const found: string[] = [];
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let block: RegExpExecArray | null;
  while ((block = scriptRe.exec(html)) !== null) {
    try {
      const txt = block[1].trim();
      if (!txt) continue;
      const data = JSON.parse(txt) as unknown;
      collectLdImages(data, pageUrl, found);
    } catch {
      continue;
    }
  }
  return found;
}

function collectLdImages(node: unknown, pageUrl: string, found: string[]): void {
  if (node === null || node === undefined) return;

  if (typeof node === 'string') return;

  if (Array.isArray(node)) {
    for (const item of node) collectLdImages(item, pageUrl, found);
    return;
  }

  if (typeof node !== 'object') return;

  const o = node as Record<string, unknown>;

  const imageVal = o.image ?? o.thumbnailUrl;
  if (typeof imageVal === 'string') {
    try {
      const u = absoluteUrl(imageVal, pageUrl);
      if (u && !looksLikeNoiseImage(u) && !found.includes(u)) found.push(u);
    } catch {
      /* ignore */
    }
  } else if (Array.isArray(imageVal)) {
    for (const x of imageVal) {
      if (typeof x === 'string') collectLdImages({ image: x }, pageUrl, found);
      else collectLdImages(x, pageUrl, found);
    }
  } else if (imageVal && typeof imageVal === 'object') {
    const img = imageVal as Record<string, unknown>;
    if (typeof img.url === 'string') collectLdImages({ image: img.url }, pageUrl, found);
    if (typeof img['@id'] === 'string') collectLdImages({ image: img['@id'] }, pageUrl, found);
    if (typeof img.contentUrl === 'string') collectLdImages({ image: img.contentUrl }, pageUrl, found);
  }

  for (const k of Object.keys(o)) {
    if (k === '@context' || k === '@type') continue;
    collectLdImages(o[k], pageUrl, found);
  }
}

export async function fetchOfficialImagesFromPage(
  pageUrl: string,
  opts?: { timeoutMs?: number }
): Promise<string[]> {
  try {
    const html = await readPublicMedia(pageUrl, 'html', opts?.timeoutMs ?? 8000);
    return extractCandidateImagesFromHtml(html.toString('utf8'), pageUrl);
  } catch {
    return [];
  }
}

/** Første brugbare officielle billede; prøver flere kilde-URL’er i rækkefølge. */
export async function resolveBestOfficialFeaturedImage(sourceUrls: string[]): Promise<string | null> {
  const unique = Array.from(
    new Set(sourceUrls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u)))
  ).slice(0, 12);

  for (const url of unique) {
    const candidates = await fetchOfficialImagesFromPage(url, { timeoutMs: 9000 });
    const best = candidates[0];
    if (best) return best;
  }
  return null;
}
