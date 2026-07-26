/**
 * Map public article URLs to Webflow CMS locales (da / en).
 */

import { normalizePathKey } from '@/lib/seo-engine/archive-audit';
import { resolveWebflowLocaleIds } from '@/lib/webflow/locale-items';

const SITE_ORIGIN = 'https://www.aproposmagazine.com';

/** Resolve editorial locale from a GSC/public page URL. */
export function resolveLocaleFromPageUrl(page: string | null | undefined): 'da' | 'en' | null {
  if (!page) return null;
  const path = normalizePathKey(page);
  if (path.startsWith('/en/articles/')) return 'en';
  if (path.startsWith('/articles/')) return 'da';
  return null;
}

export function cmsLocaleIdFor(locale: 'da' | 'en'): string {
  const ids = resolveWebflowLocaleIds();
  return locale === 'en' ? ids.en : ids.dk;
}

export function publicArticleUrl(slug: string, locale: 'da' | 'en'): string {
  const s = slug.replace(/^\/+|\/+$/g, '');
  return locale === 'en'
    ? `${SITE_ORIGIN}/en/articles/${s}`
    : `${SITE_ORIGIN}/articles/${s}`;
}

export function languageForLocale(locale: 'da' | 'en'): 'da' | 'en' {
  return locale;
}

/** Map a Webflow cmsLocaleId to da/en when it matches configured locale IDs. */
export function resolveLocaleFromCmsLocaleId(
  cmsLocaleId: string | null | undefined
): 'da' | 'en' | null {
  if (!cmsLocaleId?.trim()) return null;
  const { dk, en } = resolveWebflowLocaleIds();
  if (cmsLocaleId === en) return 'en';
  if (cmsLocaleId === dk) return 'da';
  return null;
}
