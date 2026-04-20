import { rewriteNewsletterLogoSrcForOutgoingEmail } from '@/lib/newsletter/email-theme';
import type { RecipientResult } from '@/lib/newsletter/get-recipients';
import {
  markScheduledSendFinished,
  type ClaimedScheduledJob,
} from '@/lib/newsletter/scheduled-send-store';
import { sendNewsletterToMany } from '@/lib/newsletter/send-resend';

/**
 * Execute a claimed scheduled newsletter job.
 * Accepts an optional pre-resolved recipient list to avoid redundant lookups
 * when the cron loop processes multiple jobs in one invocation.
 */
export async function executeClaimedScheduledNewsletterJob(
  job: ClaimedScheduledJob,
  cachedRecipients?: RecipientResult
): Promise<{ summary: string }> {
  const subjectLabel = job.subject.trim().replace(/\s+/g, ' ').slice(0, 120) || 'Uden emne';
  try {
    const html = rewriteNewsletterLogoSrcForOutgoingEmail(job.html);
    const recipients = cachedRecipients ?? (await import('@/lib/newsletter/get-recipients').then(m => m.getNewsletterRecipients()));

    const alreadySent = new Set((job.sentAddresses ?? []).map((e: string) => e.trim().toLowerCase()));
    const toSend = recipients.emails.filter((e) => !alreadySent.has(e.trim().toLowerCase()));

    if (toSend.length === 0 && alreadySent.size > 0) {
      await markScheduledSendFinished(job.id, {
        ok: true,
        summary: `${subjectLabel} · ${alreadySent.size} allerede sendt (retry)`,
      });
      return { summary: `${subjectLabel}: ${alreadySent.size} allerede sendt` };
    }

    if (toSend.length === 0) {
      await markScheduledSendFinished(job.id, {
        ok: false,
        error: recipients.error || 'Ingen aktive modtagere',
      });
      return { summary: `${subjectLabel}: ingen modtagere` };
    }

    const result = await sendNewsletterToMany({
      recipients: toSend,
      subject: job.subject,
      html,
      tags: [
        { name: 'channel', value: 'newsletter' },
        { name: 'send_type', value: 'scheduled' },
        // job.id matcher den interne planlagte send — kan korreleres med
        // historik i Firestore og ses i GA4 som `resend_tag_job_id`.
        { name: 'job_id', value: String(job.id).slice(0, 32) },
      ],
    });

    const totalSent = result.sent + alreadySent.size;
    const allSentAddresses = [...alreadySent, ...result.sentAddresses];

    if (result.failed === 0) {
      await markScheduledSendFinished(job.id, {
        ok: true,
        summary: `${subjectLabel} · ${totalSent} sendt`,
        sentAddresses: allSentAddresses,
      });
      return { summary: `${subjectLabel}: ${totalSent} sendt` };
    }

    await markScheduledSendFinished(job.id, {
      ok: false,
      error: `${result.failed} fejl — ${result.errors.slice(0, 3).join('; ')}`,
      sentAddresses: allSentAddresses,
    });
    return { summary: `${subjectLabel}: delvis fejl (${result.failed}/${toSend.length})` };
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Ukendt fejl';
    console.error('[newsletter/execute-scheduled-job]', { jobId: job.id, error: err });
    await markScheduledSendFinished(job.id, { ok: false, error: err });
    return { summary: `${subjectLabel}: exception` };
  }
}
