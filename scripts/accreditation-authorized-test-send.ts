/**
 * Authorized production test send — ONLY when explicitly enabled.
 *
 * Prefer the SMTP script for Liv identity:
 *   scripts/accreditation-authorized-smtp-test-send.ts
 *
 * This script uses whatever ACCREDITATION_MAIL_TRANSPORT is set to
 * (default smtp). Resend requires ACCREDITATION_MAIL_TRANSPORT=resend.
 *
 * Usage:
 *   ACCREDITATION_AUTHORIZED_TEST_SEND=1 npx tsx scripts/accreditation-authorized-test-send.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { getAgentControl, isAutomationEnabled, isDryRun } from '../lib/accreditation/agent-control';
import {
  getAccreditationMailIdentityPublic,
  getAccreditationMailTransport,
  getAccreditationReplyTo,
  sendAccreditationEmail,
} from '../lib/accreditation/send-email';
import { textToEmailHtml, withLivSignature } from '../lib/accreditation/draft-template';
import { appendAudit } from '../lib/accreditation/audit-store';

const TO = 'frederik.emil.kragh@gmail.com';
const REQUEST_ID = 'LIV-901';
const THREAD_ID = `authorized-test-${Date.now()}`;

async function main() {
  if (process.env.ACCREDITATION_AUTHORIZED_TEST_SEND !== '1') {
    console.error(
      'Refusing: set ACCREDITATION_AUTHORIZED_TEST_SEND=1 only after acceptance tests pass and Frederik authorizes.'
    );
    process.exit(2);
  }

  if ((await isDryRun()) || (await getAgentControl()).dryRun) {
    console.error('Refusing: dry-run is ON. Turn off dry-run before authorized production send.');
    process.exit(2);
  }

  if (!(await isAutomationEnabled()) && process.env.FORCE_MANUAL_TEST !== '1') {
    console.error('Refusing: Liv automation is OFF. Turn ON or set FORCE_MANUAL_TEST=1.');
    process.exit(2);
  }

  const identity = getAccreditationMailIdentityPublic();
  const replyTo = getAccreditationReplyTo(THREAD_ID);
  const transport = getAccreditationMailTransport();

  const subject = `Liv · test af akkrediteringsdialog (Apropos) [${REQUEST_ID}]`;
  const text = withLivSignature(
    [
      'Hej Frederik,',
      '',
      `Dette er en autoriseret, rutine-testmail fra Liv (Akkreditering-desk) via ${transport} for at validere outbound + Reply-To.`,
      '',
      `Svar gerne kort på denne mail (Reply-To: ${replyTo}), så vi kan bekræfte one.com IMAP-korrelation via emne-ID ${REQUEST_ID}.`,
      '',
      'Venlig hilsen',
    ].join('\n')
  );

  const result = await sendAccreditationEmail({
    to: TO,
    subject,
    html: textToEmailHtml(text),
    text,
    threadId: THREAD_ID,
    requestId: REQUEST_ID,
  });

  if (!result.ok) {
    console.error('Send failed:', result.error);
    process.exit(1);
  }

  await appendAudit({
    requestId: REQUEST_ID,
    type: 'authorized_test_send',
    detail: `Authorized test email → ${TO}`,
    meta: {
      transport: result.transport || transport,
      resendEmailId: result.resendEmailId || null,
      messageId: result.messageId || null,
      replyTo: result.replyTo || replyTo,
      subject: result.subject || subject,
      from: result.from || identity.from,
      replyToMode: identity.replyToMode,
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        transport: result.transport || transport,
        to: TO,
        resendId: result.resendEmailId,
        messageId: result.messageId,
        subject: result.subject,
        replyTo: result.replyTo || replyTo,
        from: result.from || identity.from,
        replyToMode: identity.replyToMode,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
