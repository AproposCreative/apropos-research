/**
 * Kun strengkonstanter — ingen Node-API'er. Så klientkomponenter kan strippe preview
 * uden at trække inject-unsubscribe → unsubscribe-token (node:crypto) ind i bundlen.
 */
export const NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER = '%%UNSUBSCRIBE_URL%%';

/** Kun til iframe-preview i browser — må ikke erstatte kildens HTML før send. */
export function stripUnsubscribePlaceholderForPreview(html: string): string {
  return html.split(NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER).join('#');
}
