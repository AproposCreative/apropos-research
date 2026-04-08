import { env } from '@/lib/config/env';
import { createUnsubscribeToken } from '@/lib/newsletter/unsubscribe-token';

export const NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER = '%%UNSUBSCRIBE_URL%%';

/** Escapes & for brug i HTML href. */
function escHref(url: string): string {
  return url.replace(/&/g, '&amp;');
}

/** Indsæt personligt, signeret frameldingslink (kalds pr. modtager ved send). */
export function injectRecipientUnsubscribeUrl(html: string, recipientEmail: string): string {
  const secret = env.NEWSLETTER_UNSUBSCRIBE_SECRET?.trim();
  const base =
    env.NEXT_PUBLIC_BASE_URL?.trim() || env.NEWSLETTER_ARTICLE_BASE_URL?.trim();
  if (!secret || !base) {
    return html.split(NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER).join('#');
  }
  const token = createUnsubscribeToken(recipientEmail, secret);
  const url = `${base.replace(/\/$/, '')}/api/newsletter/unsubscribe?t=${encodeURIComponent(token)}`;
  return html.split(NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER).join(escHref(url));
}

/** Forhåndsvisning i værktøj: knap peger ikke på rigtigt link. */
export function stripUnsubscribePlaceholderForPreview(html: string): string {
  return html.split(NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER).join('#');
}
