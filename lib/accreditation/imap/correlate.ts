import type { AccreditationEmailThread } from '@/lib/accreditation/types';
import { findThreadForInbound, getThreadById, readEmailThreads } from '@/lib/accreditation/email-thread-store';
import { getRequestById } from '@/lib/accreditation/request-store';
import { normalizeMessageId } from '@/lib/accreditation/imap/cursor-store';
import { extractBracketRequestId } from '@/lib/accreditation/sanitize';

const DEFAULT_ACTIVE_THREAD_DAYS = 45;

export type ParsedInboundMail = {
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  fromEmail: string;
  fromName?: string;
  toAddresses: string[];
  subject: string;
  text: string;
  html?: string;
  date?: string;
  /** Raw header bag (lower-case keys). */
  headers: Record<string, string>;
  attachments?: Array<{
    filename: string;
    contentType?: string;
    content: Buffer;
  }>;
};

/** Old or closed cases must never be reopened by an inbound email. */
export function isActiveAccreditationThread(
  thread: AccreditationEmailThread,
  nowMs = Date.now()
): boolean {
  if (thread.status === 'closed' || thread.status === 'draft') return false;
  const configuredDays = Number(process.env.ACCREDITATION_ACTIVE_THREAD_DAYS || '');
  const activeDays =
    Number.isFinite(configuredDays) && configuredDays > 0
      ? configuredDays
      : DEFAULT_ACTIVE_THREAD_DAYS;
  const updatedMs = Date.parse(thread.updatedAt || thread.createdAt);
  if (!Number.isFinite(updatedMs)) return false;
  return updatedMs >= nowMs - activeDays * 24 * 60 * 60 * 1000;
}

/** Strip Re:/Fwd:/SV:/VS: chains for matching. */
export function normalizeSubjectForMatch(subject: string): string {
  let s = subject.trim();
  // Repeated reply/forward prefixes (EN/DA)
  for (let i = 0; i < 8; i++) {
    const next = s.replace(/^(re|fwd|fw|sv|vs)\s*:\s*/i, '').trim();
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+/g, ' ').trim();
}

export function extractRequestIdFromText(text: string): string | null {
  const bracket = extractBracketRequestId(text);
  if (bracket) return bracket;
  const m = text.match(/\b(LIV-(?:HIST-)?\d{3,})\b/i);
  if (!m) return null;
  return m[1].toUpperCase();
}

export function extractThreadIdFromAddresses(addresses: string[]): string | null {
  for (const addr of addresses) {
    const m = addr.match(/liv\+([a-z0-9_-]+)@/i);
    if (m) return m[1];
  }
  return null;
}

async function threadForRequestId(requestId: string): Promise<AccreditationEmailThread | undefined> {
  const req = await getRequestById(requestId);
  if (req?.threadId) {
    const t = await getThreadById(req.threadId);
    if (t && isActiveAccreditationThread(t)) return t;
  }
  const byRequest = (await readEmailThreads()).find(
    (t) =>
      t.requestId.toUpperCase() === requestId &&
      isActiveAccreditationThread(t)
  );
  return byRequest;
}

function isExpectedThreadSender(
  thread: AccreditationEmailThread,
  fromEmail: string
): boolean {
  return thread.contactEmail.trim().toLowerCase() === fromEmail.trim().toLowerCase();
}

/**
 * Correlate an IMAP inbound message to an accreditation thread.
 * Priority: custom headers → plus-alias → In-Reply-To/References →
 * bracket/bare request id in subject (Re/Fwd safe) → body id → contact email.
 */
export async function correlateInboundToThread(
  mail: ParsedInboundMail
): Promise<AccreditationEmailThread | undefined> {
  const headerThread =
    mail.headers['x-apropos-thread-id'] || mail.headers['x-accreditation-thread-id'];
  if (headerThread) {
    const t = await getThreadById(headerThread.trim());
    if (t && isActiveAccreditationThread(t) && isExpectedThreadSender(t, mail.fromEmail)) {
      return t;
    }
  }

  const headerRequest =
    mail.headers['x-apropos-request-id'] || mail.headers['x-accreditation-request-id'];
  if (headerRequest) {
    const t = await threadForRequestId(headerRequest.trim().toUpperCase());
    if (t && isExpectedThreadSender(t, mail.fromEmail)) return t;
  }

  const plusId = extractThreadIdFromAddresses(mail.toAddresses);
  if (plusId) {
    const all = await readEmailThreads();
    const t = all.find(
      (x) =>
        (x.id === plusId || x.id.includes(plusId)) &&
        isActiveAccreditationThread(x)
    );
    if (t && isExpectedThreadSender(t, mail.fromEmail)) return t;
  }

  const replyIds = [
    normalizeMessageId(mail.inReplyTo),
    ...(mail.references || []).map((r) => normalizeMessageId(r)),
  ].filter(Boolean) as string[];

  if (replyIds.length) {
    for (const thread of await readEmailThreads()) {
      for (const msg of thread.messages) {
        const mid = normalizeMessageId(
          (msg as { messageId?: string }).messageId || msg.resendEmailId
        );
        if (
          mid &&
          replyIds.includes(mid) &&
          isActiveAccreditationThread(thread) &&
          isExpectedThreadSender(thread, mail.fromEmail)
        ) {
          return thread;
        }
      }
    }
  }

  const subjectNorm = normalizeSubjectForMatch(mail.subject || '');
  const reqFromSubject =
    extractRequestIdFromText(mail.subject || '') || extractRequestIdFromText(subjectNorm);
  if (reqFromSubject) {
    const t = await threadForRequestId(reqFromSubject);
    if (t && isExpectedThreadSender(t, mail.fromEmail)) return t;
  }

  const reqFromBody = extractRequestIdFromText((mail.text || '').slice(0, 2000));
  if (reqFromBody) {
    const t = await threadForRequestId(reqFromBody);
    if (t && isExpectedThreadSender(t, mail.fromEmail)) return t;
  }

  // Deliberately no contact-email or subject-similarity fallback. A sender's
  // address or an old subject alone must never reopen a historical case.
  return undefined;
}
