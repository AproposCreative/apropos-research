import { env } from '@/lib/config/env';
import { createUnsubscribeToken } from '@/lib/newsletter/unsubscribe-token';

export const NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER = '%%UNSUBSCRIBE_URL%%';

/** Escapes & for brug i HTML href. */
function escHref(url: string): string {
  return url.replace(/&/g, '&amp;');
}

function resolveUnsubscribeBaseUrl(): string | undefined {
  const fromDedicated = env.NEWSLETTER_UNSUBSCRIBE_BASE_URL?.trim();
  if (fromDedicated) return fromDedicated.replace(/\/$/, '');

  const fromPublicBase = env.NEXT_PUBLIC_BASE_URL?.trim();
  if (fromPublicBase) return fromPublicBase.replace(/\/$/, '');

  const fromVercelProd = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (fromVercelProd) {
    return `https://${fromVercelProd.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  }

  const fromVercelPreview = env.VERCEL_URL?.trim();
  if (fromVercelPreview) {
    return `https://${fromVercelPreview.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  }

  const fromNewsletterBase = env.NEWSLETTER_ARTICLE_BASE_URL?.trim();
  if (fromNewsletterBase) return fromNewsletterBase.replace(/\/$/, '');

  return undefined;
}

/** Indsæt personligt, signeret frameldingslink (kalds pr. modtager ved send). */
export function injectRecipientUnsubscribeUrl(html: string, recipientEmail: string): string {
  if (!html.includes(NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER)) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[newsletter] HTML mangler %%UNSUBSCRIBE_URL%% — personligt afmeld-link indsættes ikke (tjek at preview ikke gemmes som send-HTML).'
      );
    }
  }

  const secret = env.NEWSLETTER_UNSUBSCRIBE_SECRET?.trim();
  const base = resolveUnsubscribeBaseUrl();
  if (!secret || !base) {
    if (process.env.NODE_ENV === 'production') {
      const parts: string[] = [];
      if (!secret) parts.push('NEWSLETTER_UNSUBSCRIBE_SECRET');
      if (!base) {
        parts.push(
          'unsubscribe base (NEWSLETTER_UNSUBSCRIBE_BASE_URL, NEXT_PUBLIC_BASE_URL, VERCEL_PROJECT_PRODUCTION_URL, VERCEL_URL eller NEWSLETTER_ARTICLE_BASE_URL)'
        );
      }
      console.warn(
        `[newsletter] Afmeld-link kan ikke bygges — mangler: ${parts.join('; ')}. Placeholder erstattes med #.`
      );
    }
    return html.split(NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER).join('#');
  }
  const token = createUnsubscribeToken(recipientEmail, secret);
  const url = `${base}/api/newsletter/unsubscribe?t=${encodeURIComponent(token)}`;
  return html.split(NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER).join(escHref(url));
}

/** Kun til iframe-preview i browser — må ikke erstatte kildens HTML før send. */
export function stripUnsubscribePlaceholderForPreview(html: string): string {
  return html.split(NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER).join('#');
}
