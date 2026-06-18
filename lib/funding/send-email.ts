import { createHash } from 'crypto';
import { Resend } from 'resend';
import { env } from '@/lib/config/env';

const DEFAULT_FUNDING_FROM = 'Apropos Funding <funding@aproposmagazine.com>';

function normalizeFrom(raw: string): string {
  const t = raw.trim();
  if (!t) return DEFAULT_FUNDING_FROM;
  if (t.includes('<') && t.includes('>')) return t;
  if (/^[^\s<>]+@[^\s<>]+$/.test(t)) return `Apropos Funding <${t}>`;
  return t;
}

export function getFundingFromEmail(): string {
  const raw = (env.FUNDING_FROM_EMAIL || process.env.FUNDING_FROM_EMAIL || '').trim();
  return normalizeFrom(raw);
}

export function getFundingReplyTo(threadId: string): string | undefined {
  const domain = (env.FUNDING_INBOUND_DOMAIN || process.env.FUNDING_INBOUND_DOMAIN || '').trim();
  if (!domain) return undefined;
  return `funding+${threadId}@${domain}`;
}

export type SendFundingEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  threadId: string;
  applicationId: string;
  opportunityId: string;
  draftHash?: string;
};

export async function sendFundingEmail(
  params: SendFundingEmailParams
): Promise<{ ok: boolean; resendEmailId?: string; error?: string }> {
  const apiKey = (env.RESEND_API_KEY || process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY mangler' };

  const resend = new Resend(apiKey);
  const from = getFundingFromEmail();
  const replyTo = getFundingReplyTo(params.threadId);

  const hash =
    params.draftHash ||
    createHash('sha256').update(`${params.threadId}:${params.subject}:${params.html}`).digest('hex').slice(0, 16);

  const { data, error } = await resend.emails.send(
    {
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      tags: [
        { name: 'funding_thread_id', value: params.threadId.slice(0, 256) },
        { name: 'application_id', value: params.applicationId.slice(0, 256) },
        { name: 'opportunity_id', value: params.opportunityId.slice(0, 256) },
      ],
    },
    { idempotencyKey: `funding-send/${params.threadId}/${hash}`.slice(0, 256) }
  );

  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: 'Resend returnerede intet id' };
  return { ok: true, resendEmailId: data.id };
}
