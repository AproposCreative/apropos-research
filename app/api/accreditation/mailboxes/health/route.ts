import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { testImapConnection } from '@/lib/accreditation/imap/client';
import {
  getGmailOptionalStatus,
  getMailboxPublicConfig,
  IMAP_ENV_NAMES,
} from '@/lib/accreditation/imap/config';
import { getCursor } from '@/lib/accreditation/imap/cursor-store';
import { env } from '@/lib/config/env';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Connection health + setup metadata.
 * Never returns passwords or secret values.
 */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const url = new URL(request.url);
  const probe = url.searchParams.get('probe') === '1';

  const liv = getMailboxPublicConfig('liv');
  const frederik = getMailboxPublicConfig('frederik');
  const inboundDomain = (
    env.ACCREDITATION_INBOUND_DOMAIN ||
    process.env.ACCREDITATION_INBOUND_DOMAIN ||
    ''
  ).trim();

  let livProbe = null;
  let frederikProbe = null;
  if (probe) {
    if (liv.passwordConfigured) livProbe = await testImapConnection('liv');
    if (frederik.passwordConfigured) frederikProbe = await testImapConnection('frederik');
  }

  return NextResponse.json(
    createSuccessResponse(
      {
        provider: 'one.com',
        host: liv.host,
        port: liv.port,
        secure: true,
        usernameHint: 'full email address',
        gmail: getGmailOptionalStatus(),
        mailTransport: {
          ok: true,
          value: process.env.ACCREDITATION_MAIL_TRANSPORT || env.ACCREDITATION_MAIL_TRANSPORT || 'smtp',
          label: 'Accreditation outbound transport (smtp primary; resend only if explicit)',
        },
        smtpOutbound: {
          host: process.env.ONECOM_SMTP_HOST || env.ONECOM_SMTP_HOST || 'send.one.com',
          port: Number(process.env.ONECOM_SMTP_PORT || env.ONECOM_SMTP_PORT || 465),
          secure: true,
          from: 'Liv Brandt <liv@aproposmagazine.com>',
          replyTo: 'liv@aproposmagazine.com',
          label: 'Outbound as Liv via one.com SMTP (not news.aproposmagazine.com)',
        },
        resendOutbound: {
          ok: Boolean((env.RESEND_API_KEY || process.env.RESEND_API_KEY || '').trim()),
          from: env.ACCREDITATION_FROM_EMAIL || process.env.ACCREDITATION_FROM_EMAIL || null,
          label: 'Optional Resend only when ACCREDITATION_MAIL_TRANSPORT=resend',
        },
        resendReceivingSubdomain: {
          configured: Boolean(inboundDomain),
          domain: inboundDomain || null,
          label: inboundDomain
            ? `Optional Reply-To liv+{threadId}@${inboundDomain} (no root MX change)`
            : 'Optional — set ACCREDITATION_INBOUND_DOMAIN to a Resend subdomain only',
        },
        mailboxes: {
          liv: {
            ...liv,
            cursor: await getCursor('liv'),
            probe: livProbe
              ? {
                  ok: livProbe.ok,
                  error: livProbe.error,
                  uidNext: livProbe.uidNext,
                  messages: livProbe.messages,
                }
              : null,
          },
          frederik: {
            ...frederik,
            cursor: await getCursor('frederik'),
            probe: frederikProbe
              ? {
                  ok: frederikProbe.ok,
                  error: frederikProbe.error,
                  uidNext: frederikProbe.uidNext,
                  messages: frederikProbe.messages,
                }
              : null,
          },
        },
        setup: {
          path: '/ai?view=akkreditering&setup=imap',
          envNames: IMAP_ENV_NAMES,
          instructions: [
            'Set LIV_IMAP_PASSWORD and FREDERIK_IMAP_PASSWORD in local .env.local and/or Vercel → Settings → Environment Variables (Production + Preview).',
            'Username is the full address (liv@aproposmagazine.com / frederik@aproposmagazine.com).',
            'Host imap.one.com port 993 SSL.',
            'Never paste passwords into chat, commits, or client-visible forms.',
            'Optional: ACCREDITATION_INBOUND_DOMAIN = Resend receiving subdomain for Reply-To aliases (root aproposmagazine.com MX stays on one.com).',
          ],
        },
      },
      { requestId }
    )
  );
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'probe').trim();
    if (action !== 'probe') {
      return NextResponse.json(
        createErrorResponse('action must be probe', {
          statusCode: 400,
          errorCode: ErrorCode.INVALID_REQUEST,
          requestId,
        }),
        { status: 400 }
      );
    }
    const which = String(body.mailbox || 'both');
    const results: Record<string, unknown> = {};
    if (which === 'liv' || which === 'both') {
      results.liv = getMailboxPublicConfig('liv').passwordConfigured
        ? await testImapConnection('liv')
        : { ok: false, error: 'LIV_IMAP_PASSWORD not configured' };
    }
    if (which === 'frederik' || which === 'both') {
      results.frederik = getMailboxPublicConfig('frederik').passwordConfigured
        ? await testImapConnection('frederik')
        : { ok: false, error: 'FREDERIK_IMAP_PASSWORD not configured' };
    }
    // Strip any accidental password fields if present
    return NextResponse.json(createSuccessResponse({ results }, { requestId }));
  } catch (e) {
    return NextResponse.json(
      createErrorResponse(e instanceof Error ? e.message : 'Probe failed', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
