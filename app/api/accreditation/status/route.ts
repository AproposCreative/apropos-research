import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createSuccessResponse } from '@/lib/api/types';
import { env } from '@/lib/config/env';
import { getAgentControl } from '@/lib/accreditation/agent-control';
import { listEscalations } from '@/lib/accreditation/approval-store';
import { readRequests } from '@/lib/accreditation/request-store';
import { checkSheetConnection, contactsTab } from '@/lib/accreditation/sheet-client';
import {
  getGmailOptionalStatus,
  getMailboxPublicConfig,
  IMAP_ENV_NAMES,
} from '@/lib/accreditation/imap/config';
import { livProfileForUi, LIV_PROMPT_VERSION } from '@/lib/accreditation/liv-system-prompt';
import { accreditationModelPublicConfig } from '@/lib/accreditation/models';
import { getMemoryHealth } from '@/lib/accreditation/memory-store';
import { resolveAccreditationPersistenceKind } from '@/lib/accreditation/persistence/env';
import { getAdminDb, getAdminStorageBucket } from '@/lib/firebase-admin';
import {
  getAccreditationMailIdentityPublic,
  getMailTransportPublicStatus,
} from '@/lib/accreditation/send-email';
import { getAccreditationOutboundSafetyPublic } from '@/lib/accreditation/outbound-safety';
import { DEFAULT_CONTACTS_TAB, DEFAULT_MAILBOX_ARCHIVE_TAB } from '@/lib/accreditation/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const mailIdentity = getAccreditationMailIdentityPublic();
  const mailTransport = getMailTransportPublicStatus();
  const memoryHealth = await getMemoryHealth();
  const persistenceKind = resolveAccreditationPersistenceKind();
  const firestoreOk = Boolean(getAdminDb());
  const storageOk = Boolean(
    getAdminStorageBucket(
      process.env.FIREBASE_ADMIN_STORAGE_BUCKET ||
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
        undefined
    )
  );
  const persistenceOk =
    persistenceKind !== 'firestore' || (firestoreOk && storageOk);
  const resendOk = Boolean((env.RESEND_API_KEY || process.env.RESEND_API_KEY || '').trim());
  const sheet = await checkSheetConnection();
  const requests = await readRequests();
  const escalations = await listEscalations();
  const control = await getAgentControl();
  const outboundSafety = getAccreditationOutboundSafetyPublic();
  const livImap = getMailboxPublicConfig('liv');
  const frederikImap = getMailboxPublicConfig('frederik');
  const gmail = getGmailOptionalStatus();
  const inboundDomain = (
    process.env.ACCREDITATION_INBOUND_DOMAIN ||
    env.ACCREDITATION_INBOUND_DOMAIN ||
    ''
  ).trim();

  return NextResponse.json(
    createSuccessResponse(
      {
        autonomy: 'risk-based',
        control,
        outboundSafety,
        models: {
          ...accreditationModelPublicConfig(),
          promptVersion: LIV_PROMPT_VERSION,
        },
        livProfile: livProfileForUi(),
        connections: {
          mailTransport: {
            ok: mailTransport.ok,
            value: mailTransport.transport,
            label: mailTransport.label,
            mode: mailTransport.transport,
          },
          smtp: {
            ok: mailTransport.smtp.passwordConfigured,
            value: `${mailTransport.smtp.user} @ ${mailTransport.smtp.host}:${mailTransport.smtp.port}`,
            label: mailTransport.smtp.passwordConfigured
              ? `one.com SMTP ready (auth: ${mailTransport.smtp.authSource})`
              : 'LIV_SMTP_PASSWORD / LIV_IMAP_PASSWORD mangler',
          },
          resend: {
            ok: resendOk,
            label:
              mailTransport.transport === 'resend'
                ? resendOk
                  ? 'Resend explicit · API key sat'
                  : 'RESEND_API_KEY mangler (transport=resend)'
                : resendOk
                  ? 'API key sat (optional fallback only when transport=resend)'
                  : 'Resend optional (not primary)',
          },
          livFrom: {
            ok:
              mailIdentity.fromDomain === 'aproposmagazine.com' &&
              !mailTransport.envFromMismatch,
            value: mailIdentity.from,
            label: mailIdentity.fromDomain
              ? `Outbound From (${mailIdentity.fromDomain})${
                  mailTransport.envFromMismatch ? ' · env news.* ignored for SMTP' : ''
                }`
              : 'Tjek ACCREDITATION_FROM_EMAIL',
          },
          replyTo: {
            ok: mailIdentity.replyToFallback.includes('@'),
            value: mailIdentity.replyToExample,
            mode: mailIdentity.replyToMode,
            fallback: mailIdentity.replyToFallback,
            label:
              mailIdentity.replyToMode === 'plus_alias'
                ? 'Reply-To plus-alias (inbound domain)'
                : 'Reply-To fallback mailbox (one.com)',
          },
          mailIdentity: {
            ok: mailIdentity.ok,
            value: `${mailIdentity.from} → ${mailIdentity.replyToExample}`,
            label: mailIdentity.label,
          },
          memory: {
            ok: memoryHealth.ok,
            value: memoryHealth.lastSyncAt
              ? `${memoryHealth.contactCount ?? '?'} contacts · last sync ${memoryHealth.lastSyncAt}`
              : memoryHealth.label,
            label: memoryHealth.label,
            backend: memoryHealth.backend,
            contactCount: memoryHealth.contactCount,
            lastSyncAt: memoryHealth.lastSyncAt || null,
            error: memoryHealth.error,
          },
          persistence: {
            ok: persistenceOk,
            value: persistenceKind,
            label:
              persistenceKind === 'firestore'
                ? firestoreOk && storageOk
                  ? 'Firestore + Storage durable'
                  : !firestoreOk
                    ? 'Firestore unavailable (fail-visible)'
                    : 'Storage bucket unavailable (fail-visible)'
                : `Local ${persistenceKind} adapter (not durable on Vercel)`,
            backend: persistenceKind,
            firestore: firestoreOk,
            storage: storageOk,
          },
          inbound: {
            ok: Boolean(inboundDomain) || livImap.passwordConfigured,
            value: inboundDomain
              ? `liv+{threadId}@${inboundDomain} (Resend subdomain)`
              : livImap.passwordConfigured
                ? 'IMAP liv@ (one.com) - primary reply path'
                : null,
            label: inboundDomain
              ? 'Optional Resend receiving subdomain (root MX unchanged)'
              : livImap.passwordConfigured
                ? 'Replies via one.com IMAP poll'
                : 'Set LIV_IMAP_PASSWORD and/or ACCREDITATION_INBOUND_DOMAIN',
          },
          livImap: {
            ok: livImap.passwordConfigured,
            value: `${livImap.user} @ ${livImap.host}:${livImap.port}`,
            label: livImap.passwordConfigured
              ? 'one.com IMAP password configured'
              : 'LIV_IMAP_PASSWORD mangler',
          },
          frederikImap: {
            ok: frederikImap.passwordConfigured,
            value: `${frederikImap.user} @ ${frederikImap.host}:${frederikImap.port}`,
            label: frederikImap.passwordConfigured
              ? 'one.com IMAP password configured'
              : 'FREDERIK_IMAP_PASSWORD mangler',
          },
          gmail: {
            ok: true,
            value: null,
            label: gmail.label,
          },
          sheet: {
            ok: sheet.ok,
            error: sheet.error,
            workflowRows: sheet.workflowRows,
            contactsRows: sheet.contactsRows,
            mailboxArchiveRows: sheet.mailboxArchiveRows,
            contactsTab: contactsTab() || DEFAULT_CONTACTS_TAB,
            mailboxArchiveTab: DEFAULT_MAILBOX_ARCHIVE_TAB,
            label: sheet.ok
              ? `Sheet OK · workflow + Contacts etc. + ${DEFAULT_MAILBOX_ARCHIVE_TAB}`
              : sheet.error || 'Sheet fejl - enable Sheets API + share SA',
          },
          approvalPolicy: {
            ok: true,
            label:
              'Risk-based autonomy: auto-send routine; escalate low-confidence / legal / captcha / injection',
          },
        },
        counts: {
          requests: requests.length,
          escalations: escalations.length,
          awaitingReply: requests.filter((r) => r.status === 'sent_awaiting_reply').length,
          needsContact: requests.filter((r) => r.status === 'needs_contact' || r.status === 'escalated')
            .length,
          paused: requests.filter((r) => r.status === 'paused').length,
        },
        setupDependencies: [
          'ACCREDITATION_MAIL_TRANSPORT=smtp (default primary)',
          'one.com SMTP send.one.com:465 TLS + LIV_SMTP_* or LIV_IMAP_* auth',
          'From: Liv Brandt <liv@aproposmagazine.com> (never news.aproposmagazine.com)',
          'Reply-To: liv@aproposmagazine.com (or plus-alias if inbound domain set)',
          'Vercel/.env.local: LIV_IMAP_PASSWORD + FREDERIK_IMAP_PASSWORD (never commit)',
          'one.com IMAP imap.one.com:993 SSL, username = full email',
          'Resend: optional only when ACCREDITATION_MAIL_TRANSPORT=resend (not silent fallback)',
          'Firestore: Firebase Admin required in production for durable contact memory',
          'Optional: ACCREDITATION_INBOUND_DOMAIN = Resend subdomain only (do not change root MX)',
          'Enable Google Sheets API + share Sheet with FIREBASE_ADMIN_CLIENT_EMAIL',
          'Hidden setup UI: /ai?view=akkreditering&setup=imap',
        ],
        imapSetup: {
          path: '/ai?view=akkreditering&setup=imap',
          envNames: IMAP_ENV_NAMES,
        },
      },
      { requestId }
    )
  );
}
