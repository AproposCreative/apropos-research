/**
 * Authorized SMTP production test send. Only runs when explicitly enabled.
 *
 * Usage (after accreditation mail-transport tests pass):
 *   ACCREDITATION_AUTHORIZED_SMTP_TEST_SEND=1 \
 *   ACCREDITATION_MAIL_TRANSPORT=smtp \
 *   npx tsx scripts/accreditation-authorized-smtp-test-send.ts
 *
 * Sends one clearly labeled Liv accreditation SMTP test to
 * frederik.emil.kragh@gmail.com from liv@aproposmagazine.com.
 *
 * Refuses to send if:
 * - ACCREDITATION_AUTHORIZED_SMTP_TEST_SEND !== '1'
 * - dry-run is on
 * - transport is not smtp
 * - SMTP From is not root liv@aproposmagazine.com
 * - SMTP auth missing
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { getAgentControl, isDryRun } from '../lib/accreditation/agent-control';
import {
  assertSmtpFromAllowed,
  getAccreditationFromEmail,
  getAccreditationMailIdentityPublic,
  getAccreditationMailTransport,
  getAccreditationReplyTo,
  getSmtpPublicConfig,
  sendAccreditationEmail,
} from '../lib/accreditation/send-email';
import {
  buildAccreditationDraft,
  textToEmailHtml,
} from '../lib/accreditation/draft-template';
import { appendAudit } from '../lib/accreditation/audit-store';
import type { AccreditationRequest } from '../lib/accreditation/types';

const TO = 'frederik.emil.kragh@gmail.com';
const REQUEST_ID = 'LIV-902';
const THREAD_ID = `authorized-smtp-test-${Date.now()}`;
const FORCE_MANUAL = process.env.FORCE_MANUAL_TEST === '1';

async function main() {
  if (process.env.ACCREDITATION_AUTHORIZED_SMTP_TEST_SEND !== '1') {
    console.error(
      'Refusing: set ACCREDITATION_AUTHORIZED_SMTP_TEST_SEND=1 only after tests pass and Frederik authorizes.'
    );
    process.exit(2);
  }

  process.env.ACCREDITATION_MAIL_TRANSPORT = 'smtp';

  if (((await isDryRun()) || (await getAgentControl()).dryRun) && !FORCE_MANUAL) {
    console.error('Refusing: dry-run is ON. Turn off dry-run before authorized SMTP send.');
    process.exit(2);
  }

  if (getAccreditationMailTransport() !== 'smtp') {
    console.error('Refusing: ACCREDITATION_MAIL_TRANSPORT must be smtp.');
    process.exit(2);
  }

  const from = getAccreditationFromEmail();
  try {
    assertSmtpFromAllowed(from);
  } catch (e) {
    console.error('Refusing: SMTP From identity check failed:', e instanceof Error ? e.message : e);
    process.exit(2);
  }

  const smtp = getSmtpPublicConfig();
  if (!smtp.passwordConfigured) {
    console.error('Refusing: SMTP password not configured (LIV_SMTP_PASSWORD or LIV_IMAP_PASSWORD).');
    process.exit(2);
  }

  const identity = getAccreditationMailIdentityPublic();
  const replyTo = getAccreditationReplyTo(THREAD_ID);

  const now = new Date().toISOString();
  const testRequest: AccreditationRequest = {
    id: REQUEST_ID,
    artist: 'Masego',
    venue: 'K.B. Hallen',
    eventDate: '2. oktober 2026',
    applicants: [{ name: 'Mathilde Sigshøj' }],
    ticketQuantity: 1,
    accessRequested: 'presseakkreditering',
    contactName: 'Frederik',
    contactEmail: TO,
    contactConfidence: 'high',
    senderMailbox: 'liv@aproposmagazine.com',
    status: 'draft_ready',
    previousCoverageUrl:
      'https://www.aproposmagazine.com/en/articles/alter-bridge-i-kb-hallen-solid-rock-uden-undskyldninger',
    notes: 'Kontrolleret test. Må kun sendes til Frederik Gmail.',
    createdAt: now,
    updatedAt: now,
  };
  const draft = buildAccreditationDraft({
    request: testRequest,
    contactName: 'Frederik',
  });
  const subject = `TEST: ${draft.subject}`;
  const text = draft.text;

  const result = await sendAccreditationEmail({
    to: TO,
    subject,
    html: textToEmailHtml(text),
    text,
    threadId: THREAD_ID,
    requestId: REQUEST_ID,
  });

  if (!result.ok) {
    console.error('SMTP send failed:', result.error);
    process.exit(1);
  }

  await appendAudit({
    requestId: REQUEST_ID,
    type: 'authorized_smtp_test_send',
    detail: `Authorized SMTP test email → ${TO}`,
    meta: {
      transport: result.transport || 'smtp',
      messageId: result.messageId || null,
      replyTo: result.replyTo || replyTo,
      subject: result.subject || subject,
      from: result.from || from,
      smtpHost: smtp.host,
      smtpPort: smtp.port,
      replyToMode: identity.replyToMode,
      controlledTest: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        transport: result.transport || 'smtp',
        to: TO,
        messageId: result.messageId,
        subject: result.subject,
        replyTo: result.replyTo || replyTo,
        from: result.from || from,
        smtpHost: smtp.host,
        smtpPort: smtp.port,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
