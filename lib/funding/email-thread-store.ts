import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import type {
  EmailDeliveryStatus,
  EmailThreadStatus,
  FundingEmailMessage,
  FundingEmailThread,
} from '@/lib/funding/types';

const FILENAME = 'funding_email_threads.json';

export function readEmailThreads(): FundingEmailThread[] {
  return readJsonFile<FundingEmailThread[]>(FILENAME, []);
}

export function writeEmailThreads(threads: FundingEmailThread[]): void {
  writeJsonFile(FILENAME, threads);
}

export function getThreadById(id: string): FundingEmailThread | undefined {
  return readEmailThreads().find((t) => t.id === id);
}

export function getThreadsByApplicationId(applicationId: string): FundingEmailThread[] {
  return readEmailThreads().filter((t) => t.applicationId === applicationId);
}

export function getThreadsByOpportunityId(opportunityId: string): FundingEmailThread[] {
  return readEmailThreads().filter((t) => t.opportunityId === opportunityId);
}

export function createEmailThread(input: {
  applicationId: string;
  opportunityId: string;
  contactEmail: string;
  contactName?: string;
  subject: string;
}): FundingEmailThread {
  const now = new Date().toISOString();
  const thread: FundingEmailThread = {
    id: `thread-${Date.now().toString(36)}`,
    applicationId: input.applicationId,
    opportunityId: input.opportunityId,
    contactEmail: input.contactEmail.trim().toLowerCase(),
    contactName: input.contactName,
    subject: input.subject.trim(),
    status: 'draft',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  const all = readEmailThreads();
  all.push(thread);
  writeEmailThreads(all);
  return thread;
}

export function updateThreadStatus(threadId: string, status: EmailThreadStatus): FundingEmailThread | null {
  const all = readEmailThreads();
  const index = all.findIndex((t) => t.id === threadId);
  if (index < 0) return null;
  all[index] = { ...all[index], status, updatedAt: new Date().toISOString() };
  writeEmailThreads(all);
  return all[index];
}

export function appendOutboundMessage(
  threadId: string,
  message: Omit<FundingEmailMessage, 'id' | 'direction'>
): FundingEmailThread | null {
  const all = readEmailThreads();
  const index = all.findIndex((t) => t.id === threadId);
  if (index < 0) return null;
  const msg: FundingEmailMessage = {
    ...message,
    id: `msg-out-${Date.now().toString(36)}`,
    direction: 'outbound',
  };
  const thread = all[index];
  thread.messages.push(msg);
  thread.status = 'sent';
  thread.lastOutboundResendId = message.resendEmailId;
  thread.updatedAt = new Date().toISOString();
  all[index] = thread;
  writeEmailThreads(all);
  return thread;
}

export function appendInboundMessage(
  threadId: string,
  message: Omit<FundingEmailMessage, 'id' | 'direction'>,
  extras?: { aiSummary?: string; suggestedReply?: string }
): FundingEmailThread | null {
  const all = readEmailThreads();
  const index = all.findIndex((t) => t.id === threadId);
  if (index < 0) return null;
  const msg: FundingEmailMessage = {
    ...message,
    id: `msg-in-${Date.now().toString(36)}`,
    direction: 'inbound',
    aiSummary: extras?.aiSummary,
    suggestedReply: extras?.suggestedReply,
  };
  const thread = all[index];
  thread.messages.push(msg);
  thread.status = 'replied';
  thread.updatedAt = new Date().toISOString();
  all[index] = thread;
  writeEmailThreads(all);
  return thread;
}

export function updateMessageDelivery(
  resendEmailId: string,
  deliveryStatus: EmailDeliveryStatus
): boolean {
  const all = readEmailThreads();
  let changed = false;
  for (const thread of all) {
    for (const msg of thread.messages) {
      if (msg.resendEmailId === resendEmailId && msg.direction === 'outbound') {
        msg.deliveryStatus = deliveryStatus;
        thread.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
  }
  if (changed) writeEmailThreads(all);
  return changed;
}

/** Match inbound by reply-to alias, thread id in recipient, or known contact email. */
export function findThreadForInbound(params: {
  toAddresses: string[];
  fromEmail: string;
  inReplyTo?: string;
}): FundingEmailThread | undefined {
  const from = params.fromEmail.trim().toLowerCase();
  const all = readEmailThreads();

  for (const addr of params.toAddresses) {
    const match = addr.match(/funding\+([a-z0-9-]+)@/i);
    if (match) {
      const thread = all.find((t) => t.id === match[1] || t.id.includes(match[1]));
      if (thread) return thread;
    }
  }

  const byContact = all.find(
    (t) => t.contactEmail === from && (t.status === 'sent' || t.status === 'awaiting_reply' || t.status === 'replied')
  );
  if (byContact) return byContact;

  return undefined;
}

export function countThreadsAwaitingReply(days = 7): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return readEmailThreads().filter((t) => {
    if (t.status !== 'awaiting_reply' && t.status !== 'sent') return false;
    const lastOut = [...t.messages].reverse().find((m) => m.direction === 'outbound');
    if (!lastOut?.sentAt) return false;
    return Date.parse(lastOut.sentAt) < cutoff;
  }).length;
}
