import { Resend } from 'resend';
import { env } from '@/lib/config/env';
import { injectRecipientUnsubscribeUrl } from '@/lib/newsletter/inject-unsubscribe';
import { buildWelcomeSignupHtml } from '@/lib/newsletter/welcome-template';

/** Verificeret domæne i Resend (news.aproposmagazine.com). Override med RESEND_FROM_EMAIL hvis nødvendigt. */
const DEFAULT_RESEND_FROM = 'Apropos Magazine <noreply@news.aproposmagazine.com>';

function resendCredentials(): { apiKey: string; from: string } {
  const apiKey = (env.RESEND_API_KEY || process.env.RESEND_API_KEY || '').trim();
  const fromRaw = (env.RESEND_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || '').trim();
  const from = fromRaw || DEFAULT_RESEND_FROM;
  return { apiKey, from };
}

export async function sendNewsletterEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { apiKey, from } = resendCredentials();
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY mangler' };
  }
  const htmlPersonalized = injectRecipientUnsubscribeUrl(params.html, params.to);
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: htmlPersonalized,
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: 'Resend returnerede intet id' };
  return { ok: true };
}

export async function sendNewsletterToMany(params: {
  recipients: string[];
  subject: string;
  html: string;
  onProgress?: (sent: number, total: number) => void;
}): Promise<{ sent: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;
  let failed = 0;
  const total = params.recipients.length;
  for (let i = 0; i < params.recipients.length; i++) {
    const to = params.recipients[i]!;
    const r = await sendNewsletterEmail({ to, subject: params.subject, html: params.html });
    if (r.ok) {
      sent++;
    } else {
      failed++;
      if (r.error) errors.push(`${to}: ${r.error}`);
    }
    params.onProgress?.(sent + failed, total);
  }
  return { sent, failed, errors };
}

/** Transactional velkomst efter Webflow signup (webhook). Genbruger Resend + unsubscribe-link. */
export async function sendWelcomeSignupEmail(to: string): Promise<{ ok: boolean; error?: string }> {
  const subject =
    env.NEWSLETTER_WELCOME_SUBJECT?.trim() || 'Velkommen til Apropos Magazine';
  const html = buildWelcomeSignupHtml();
  return sendNewsletterEmail({ to, subject, html });
}
