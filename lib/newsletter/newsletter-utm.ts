import type { WeekRange } from '@/lib/newsletter/week-range';
import { NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER } from '@/lib/newsletter/inject-unsubscribe';

/** Stabil kampagne-streng til GA4 (ugentligt nyhedsbrev). */
export function newsletterUtmCampaignFromWeek(week: WeekRange): string {
  const y = week.start.getUTCFullYear();
  return `weekly-${y}-w${String(week.isoWeek).padStart(2, '0')}`;
}

function isTrackedMagazineHost(hostname: string, siteUrl: string): boolean {
  if (hostname === 'www.aproposmagazine.com' || hostname.endsWith('.aproposmagazine.com')) {
    return true;
  }
  try {
    return hostname === new URL(siteUrl).hostname;
  } catch {
    return false;
  }
}

/**
 * Tilføjer utm_source / utm_medium / utm_campaign til links til magasin-sitet.
 * Spring over mailto, unsubscribe og ikke-apropos URL'er.
 */
export function appendNewsletterUtmToUrl(
  href: string,
  siteUrl: string,
  campaign: string
): string {
  const trim = href.trim();
  if (!trim || trim === '#' || trim.toLowerCase().startsWith('mailto:')) return trim;
  if (trim.includes(NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER)) return trim;
  if (trim.includes('/api/newsletter/unsubscribe')) return trim;

  const base = siteUrl.replace(/\/$/, '');
  let url: URL;
  try {
    url = new URL(trim, `${base}/`);
  } catch {
    return trim;
  }

  if (!isTrackedMagazineHost(url.hostname, siteUrl)) return trim;

  url.searchParams.set('utm_source', 'newsletter');
  url.searchParams.set('utm_medium', 'email');
  url.searchParams.set('utm_campaign', campaign);
  return url.toString();
}
