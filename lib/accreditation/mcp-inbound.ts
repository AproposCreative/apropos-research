import { getRequestById, updateRequest } from './request-store';
import { appendInboundMessage } from './email-thread-store';
import { ingestInboundAccessMaterials, type InboundAttachmentInput } from './access-package';
import { canTransition } from './state-machine';
import type { AccreditationEmailThread, AccreditationEmailMessage } from './types';
/** Existing ingestion can retain replies/billets for personal cases, but never classify with AI or send. */
export async function retainPersonalAccreditationInbound(thread: AccreditationEmailThread,
  message: Omit<AccreditationEmailMessage, 'id' | 'direction'>, attachments?: InboundAttachmentInput[]) {
  const row = await getRequestById(thread.requestId);
  if (!row?.mcp) return false;
  if (message.from.toLowerCase() !== thread.contactEmail.toLowerCase()) return true;
  if (thread.messages.some(m => (message.messageId && m.messageId === message.messageId) ||
    (message.resendEmailId && m.resendEmailId === message.resendEmailId))) return true;
  await appendInboundMessage(thread.id, { ...message, html: undefined, untrusted: true });
  const result = await ingestInboundAccessMaterials({ requestId: row.id, text: message.text || '', attachments });
  await updateRequest(row.id, { ...(canTransition(row.status, 'replied') ? { status: 'replied' } : {}),
    ...(result.hasPackage ? { finalDeliveryStatus: 'package_ready', finalPackageDelivered: false } : {}) });
  return true;
}
