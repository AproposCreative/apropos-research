import { rewriteNewsletterLogoSrcForOutgoingEmail } from '@/lib/newsletter/email-theme';
import { getNewsletterRecipients } from '@/lib/newsletter/get-recipients';
import {
  markScheduledSendFinished,
  type ClaimedScheduledJob,
} from '@/lib/newsletter/scheduled-send-store';
import { sendNewsletterToMany } from '@/lib/newsletter/send-resend';

export async function executeClaimedScheduledNewsletterJob(
  job: ClaimedScheduledJob
): Promise<{ summary: string }> {
  try {
    const html = rewriteNewsletterLogoSrcForOutgoingEmail(job.html);
    const recipients = await getNewsletterRecipients();
    if (recipients.emails.length === 0) {
      await markScheduledSendFinished(job.id, {
        ok: false,
        error: recipients.error || 'Ingen aktive modtagere',
      });
      return { summary: `${job.id}: ingen modtagere` };
    }
    const result = await sendNewsletterToMany({
      recipients: recipients.emails,
      subject: job.subject,
      html,
    });
    if (result.failed === 0) {
      await markScheduledSendFinished(job.id, {
        ok: true,
        summary: `${result.sent} sendt`,
      });
      return { summary: `${job.id}: ${result.sent} sendt` };
    }
    await markScheduledSendFinished(job.id, {
      ok: false,
      error: `${result.failed} fejl — ${result.errors.slice(0, 3).join('; ')}`,
    });
    return { summary: `${job.id}: delvis fejl (${result.failed})` };
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Ukendt fejl';
    await markScheduledSendFinished(job.id, { ok: false, error: err });
    return { summary: `${job.id}: exception` };
  }
}
