/**
 * Real-LLM multi-turn Liv dialogue smoke (dry-run by default).
 *
 * Usage:
 *   npx tsx scripts/accreditation-liv-dialogue-smoke.ts
 *   npx tsx scripts/accreditation-liv-dialogue-smoke.ts --send-to=you@example.com
 *
 * Without --send-to: never calls SMTP/Resend; only exercises OpenAI + memory + assertions.
 * With --send-to: optional explicit send of the FINAL reply only (still requires
 * ACCREDITATION_AUTHORIZED_DIALOGUE_SEND=1). Uses SMTP root From by default.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

process.env.ACCREDITATION_PERSISTENCE_BACKEND =
  process.env.ACCREDITATION_PERSISTENCE_BACKEND || 'memory';
process.env.ACCREDITATION_MEMORY_BACKEND = process.env.ACCREDITATION_MEMORY_BACKEND || 'memory';
process.env.ACCREDITATION_MAIL_TRANSPORT = process.env.ACCREDITATION_MAIL_TRANSPORT || 'smtp';
delete process.env.ACCREDITATION_INBOUND_DOMAIN;

async function main() {
  const sendToArg = process.argv.find((a) => a.startsWith('--send-to='));
  const sendTo = sendToArg ? sendToArg.slice('--send-to='.length).trim() : '';

  const { resetAllAccreditationStoresForTests } = await import(
    '../lib/accreditation/persistence/test-reset'
  );
  await resetAllAccreditationStoresForTests();

  const { getOpenAIClient } = await import('../lib/openai');
  if (!getOpenAIClient()) {
    console.error('OPENAI_API_KEY missing - cannot run real-LLM smoke');
    process.exit(2);
  }

  const {
    createOpenAiDialogueGenerator,
    runMultiTurnLivDialogue,
  } = await import('../lib/accreditation/multi-turn-dialogue');
  const { containsForbiddenDash } = await import('../lib/accreditation/sanitize');
  const { LIV_MAILBOX } = await import('../lib/accreditation/types');

  const result = await runMultiTurnLivDialogue({
    generator: createOpenAiDialogueGenerator(),
    forceReplyToFallback: true,
  });

  const report = {
    mode: sendTo ? 'send-requested' : 'dry-run',
    requestId: result.requestId,
    replyTo: result.replyTo,
    replyToOk: result.replyTo === LIV_MAILBOX,
    assertionOk: result.assertions.ok,
    failures: result.assertions.failures,
    turns: result.publicTranscript.map((t) => ({
      turn: t.turn,
      direction: t.direction,
      subject: t.subject,
      preview: t.preview,
      novelQuestion: t.novelQuestion ?? null,
      memoryChars: t.memoryChars ?? null,
      hasEmDash: false,
    })),
    outboundChecks: result.outbounds.map((o) => ({
      subject: o.subject,
      replyTo: o.replyTo,
      novelQuestion: o.novelQuestion,
      hasEmDash: containsForbiddenDash(o.text) || containsForbiddenDash(o.subject),
      memoryLoaded: o.memoryLoaded.length > 0,
      preview: o.text.replace(/\s+/g, ' ').trim().slice(0, 220),
    })),
  };

  // Never log passwords or full private mailbox bodies
  console.log(JSON.stringify(report, null, 2));

  if (sendTo) {
    if (process.env.ACCREDITATION_AUTHORIZED_DIALOGUE_SEND !== '1') {
      console.error(
        'Refusing send: set ACCREDITATION_AUTHORIZED_DIALOGUE_SEND=1 with explicit --send-to'
      );
      process.exit(2);
    }
    const { sendAccreditationEmail } = await import('../lib/accreditation/send-email');
    const { textToEmailHtml } = await import('../lib/accreditation/draft-template');
    const last = result.outbounds[result.outbounds.length - 1]!;
    const sent = await sendAccreditationEmail({
      to: sendTo,
      subject: last.subject,
      html: textToEmailHtml(last.text),
      text: last.text,
      threadId: result.threadId,
      requestId: result.requestId,
    });
    console.log(
      JSON.stringify(
        {
          sent: sent.ok,
          transport: sent.transport || null,
          messageId: sent.messageId || null,
          resendId: sent.resendEmailId || null,
          from: sent.from || null,
          replyTo: sent.replyTo || result.replyTo,
          error: sent.error || null,
        },
        null,
        2
      )
    );
    if (!sent.ok) process.exit(1);
  }

  if (!result.assertions.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
