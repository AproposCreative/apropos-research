import { env } from '@/lib/config/env';

const ALLOWED_HOSTS = new Set([
  'aproposmagazine.dk',
  'www.aproposmagazine.dk',
  'aproposmagazine.com',
  'www.aproposmagazine.com',
]);

export function isAllowedArticleHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (ALLOWED_HOSTS.has(h)) return true;
  return h.endsWith('.aproposmagazine.com') || h.endsWith('.aproposmagazine.dk');
}

export function articleBaseUrl(): string {
  const fromEnv = env.NEWSLETTER_ARTICLE_BASE_URL?.trim().replace(/\/$/, '');
  return fromEnv || 'https://www.aproposmagazine.com';
}

/**
 * Udled slug fra artikel-URL — sidste path-segment.
 * Fx https://www.aproposmagazine.com/articles/cape-fear-apple-tv → cape-fear-apple-tv
 */
export function slugFromArticleUrl(raw: string): { ok: true; slug: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'Angiv en artikel-URL' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Ugyldig URL' };
  }

  if (!isAllowedArticleHost(url.hostname)) {
    return { ok: false, error: 'URL skal være på aproposmagazine.com eller aproposmagazine.dk' };
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const slug = segments[segments.length - 1]?.trim();
  if (!slug) {
    return { ok: false, error: 'Kunne ikke udlede slug fra URL' };
  }

  return { ok: true, slug };
}

export function normalizeArticleUrl(slug: string): string {
  const base = articleBaseUrl();
  if (base.includes('/articles')) {
    return `${base.replace(/\/$/, '')}/${slug}`;
  }
  return `${base}/articles/${slug}`;
}

export function looksLikeArticleUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return isAllowedArticleHost(url.hostname) && url.pathname.split('/').filter(Boolean).length > 0;
  } catch {
    return false;
  }
}
