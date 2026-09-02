/**
 * Editor ↔ Liv email loop — the "AI colleague" surface.
 *
 * Two dashboard-free behaviours over plain email:
 *  1. Ask-when-in-doubt: when Liv escalates, she emails the editor (Frederik)
 *     the question; when he replies, she composes and sends the answer to the
 *     original sender (round-trip).
 *  2. Tasking: any @aproposmagazine.com colleague can email Liv an instruction
 *     ("søg akkreditering til X", "bed om billetter til Y"); Liv composes and
 *     sends the outreach, then confirms back to that colleague. External
 *     senders can never trigger this path — hardcoded, not a setting.
 *
 * All sends go through the same safety gates as any Liv send (kill-switch,
 * test-redirect, allowlist, per-run cap).
 */
import type { LivInboxItem, LivInboxSettings } from '@/lib/liv-inbox/types';
import { updateInboxItem } from '@/lib/liv-inbox/inbox-store';
import { sendLivInboxReply, type LivSendResult } from '@/lib/liv-inbox/send';
import { appendLivInboxAudit } from '@/lib/liv-inbox/audit-store';
import { normalizeMsgId } from '@/lib/liv-inbox/correlate';
import {
  composeGuidedReply,
  composeOutreach,
  parseEditorTask,
  type InboundEmailInput,
} from '@/lib/liv-inbox/assistant';
import { gatherSenderIntelligence, rememberSentReply } from '@/lib/liv-inbox/context';
import { canGiveLivTasks, isAproposStaffEmail } from '@/lib/liv-inbox/staff';

const DEFAULT_EDITOR_EMAIL = 'frederik@aproposmagazine.com';

export function getEditorEmail(settings: LivInboxSettings): string {
  const candidate = (settings.editorEmail || process.env.LIV_INBOX_EDITOR_EMAIL || DEFAULT_EDITOR_EMAIL)
    .trim()
    .toLowerCase();
  return isAproposStaffEmail(candidate) ? candidate : DEFAULT_EDITOR_EMAIL;
}

/** Any verified @aproposmagazine.com human — not just the configured editor. */
export function isFromEditor(
  email: string,
  _settings?: LivInboxSettings,
  headers?: Record<string, string> | null
): boolean {
  return canGiveLivTasks(email, headers);
}

function buildEditorQuestion(item: LivInboxItem): string {
  const lines: string[] = [
    'Hej Frederik,',
    '',
    'Jeg er i tvivl om denne henvendelse og vil gerne have din vurdering, før jeg svarer.',
    '',
    `Fra: ${item.fromName ? `${item.fromName} <${item.fromEmail}>` : item.fromEmail}`,
    `Emne: ${item.subject}`,
  ];
  if (item.category) lines.push(`Kategori: ${item.category}`);
  if (item.reasoning) lines.push(`Min tvivl: ${item.reasoning}`);
  if (item.attachments?.length) {
    lines.push(`Vedhæftninger: ${item.attachments.map((a) => a.filename).join(', ')}`);
  }
  lines.push('', 'Deres besked:', (item.body || '').slice(0, 1500), '');
  lines.push('Svar blot på denne mail med hvordan jeg skal svare, så sender jeg videre til dem.', '', 'Kh Liv');
  return lines.join('\n');
}

/** Ask the editor a question about an item Liv is unsure about (once per item). */
export async function sendEscalationToEditor(
  item: LivInboxItem,
  settings: LivInboxSettings
): Promise<LivSendResult> {
  if (item.escalationEmailedAt) return { sent: false, reason: 'Allerede spurgt' };
  const editor = getEditorEmail(settings);
  const result = await sendLivInboxReply({
    itemId: item.id,
    to: editor,
    subject: `Liv spørger: ${item.subject}`.slice(0, 180),
    text: buildEditorQuestion(item),
  });
  if (result.sent) {
    await updateInboxItem(item.id, {
      escalationEmailedAt: new Date().toISOString(),
      escalationMessageId: result.outboundMessageId,
    });
  }
  await appendLivInboxAudit({
    type: 'asked_editor',
    itemId: item.id,
    contactEmail: item.fromEmail,
    subject: item.subject,
    detail: result.sent
      ? `Spurgte ${editor} til råds${result.redirected ? ' (test-redirect)' : ''}`
      : `Kunne ikke spørge ${editor}: ${result.reason}`,
    meta: { sent: result.sent, editor },
  });
  return result;
}

/** Is this inbound the editor's reply to one of Liv's questions? Return that item. */
export function correlateEditorReply(
  mail: { inReplyTo?: string; references?: string[] },
  items: LivInboxItem[]
): LivInboxItem | undefined {
  const replyIds = [normalizeMsgId(mail.inReplyTo), ...(mail.references || []).map(normalizeMsgId)].filter(
    Boolean
  );
  if (replyIds.length === 0) return undefined;
  const candidates = items
    .filter((i) => i.escalationMessageId && !i.resolvedByEditor)
    .sort((a, b) => (b.escalationEmailedAt || '').localeCompare(a.escalationEmailedAt || ''));
  for (const item of candidates) {
    if (replyIds.includes(normalizeMsgId(item.escalationMessageId))) return item;
  }
  return undefined;
}

/** Apply the editor's guidance: compose the reply and send it to the original sender. */
export async function applyEditorGuidanceAndSend(
  item: LivInboxItem,
  guidance: string,
  settings: LivInboxSettings
): Promise<LivSendResult> {
  const intel = await gatherSenderIntelligence(item.fromEmail, item.fromName);
  const input: InboundEmailInput = {
    fromEmail: item.fromEmail,
    fromName: item.fromName,
    subject: item.subject,
    body: item.body,
    attachments: item.attachments,
  };
  const decision = await composeGuidedReply(settings, input, guidance, {
    intelligence: intel.block,
    language: item.language,
  });
  const send = await sendLivInboxReply({
    itemId: item.id,
    to: item.fromEmail,
    subject: `Re: ${item.subject}`,
    text: decision.reply,
    inReplyToMessageId: item.sourceMessageId,
  });
  await updateInboxItem(item.id, {
    draftReply: decision.reply,
    status: send.sent ? 'sent' : 'escalated',
    resolvedByEditor: true,
    needsHuman: false,
    handledAt: new Date().toISOString(),
    sent: send.sent,
    sentTo: send.to,
    sentAt: send.sent ? new Date().toISOString() : undefined,
    sendId: send.id,
    outboundMessageId: send.outboundMessageId,
    sendRedirected: send.redirected,
    sentVia: send.transport,
    sentCopyArchived: send.sentCopyArchived,
    sendBlockedReason: send.sent ? undefined : send.reason,
  });
  if (send.sent) {
    await rememberSentReply({
      email: item.fromEmail,
      name: item.fromName,
      subject: item.subject,
      replyBlurb: decision.reply,
    });
  }
  await appendLivInboxAudit({
    type: 'editor_guided',
    itemId: item.id,
    contactEmail: item.fromEmail,
    subject: item.subject,
    detail: send.sent
      ? `Frederiks svar brugt; sendt til ${send.to}${send.redirected ? ' (test-redirect)' : ''}`
      : `Frederiks svar brugt (ikke sendt: ${send.reason})`,
    meta: { sent: send.sent },
  });
  return send;
}

export interface EditorTaskResult {
  handled: boolean;
  action?: string;
  detail: string;
}

/** Carry out a task a staff member emailed to Liv (accreditation, tickets, outreach). */
export async function handleEditorTask(
  mail: {
    fromEmail: string;
    fromName?: string;
    subject?: string;
    text?: string;
    messageId?: string;
    headers?: Record<string, string>;
  },
  settings: LivInboxSettings
): Promise<EditorTaskResult> {
  if (!canGiveLivTasks(mail.fromEmail, mail.headers)) {
    await appendLivInboxAudit({
      type: 'editor_guided',
      contactEmail: mail.fromEmail,
      subject: mail.subject,
      detail: 'Afvist: kun @aproposmagazine.com kan give Liv opgaver.',
      meta: { rejected: true, reason: 'not_staff' },
    });
    return { handled: false, detail: 'Afvist: kun @aproposmagazine.com kan give Liv opgaver.' };
  }

  const requester = mail.fromEmail.trim().toLowerCase();
  const input: InboundEmailInput = {
    fromEmail: mail.fromEmail,
    fromName: mail.fromName,
    subject: mail.subject || '(uden emne)',
    body: mail.text || '',
  };

  const task = await parseEditorTask(input);
  if (!task) return { handled: false, detail: 'Kunne ikke fortolke opgaven (ingen AI).' };

  const suffix = Math.random().toString(36).slice(2, 8);

  // Only stall for the editor when the recipient is genuinely unknown — otherwise
  // stay autonomous and send (the outreach itself can ask for any specifics).
  if (!task.recipientEmail) {
    const q = task.clarificationQuestion || 'Hvem skal jeg sende det til (mail-adresse)?';
    await sendLivInboxReply({
      itemId: `task-clarify-${suffix}`,
      to: requester,
      subject: `Re: ${input.subject}`.slice(0, 180),
      text: `Hej,\n\nJeg vil gerne løse opgaven (${task.subject || 'opgave'}), men mangler lige: ${q}\n\nKh Liv`,
      inReplyToMessageId: mail.messageId,
    });
    await appendLivInboxAudit({
      type: 'asked_editor',
      contactEmail: requester,
      subject: input.subject,
      detail: `Bad ${requester} om afklaring: ${q}`,
      meta: { task: task.action },
    });
    return { handled: true, action: task.action, detail: 'Bad om afklaring' };
  }

  const intel = await gatherSenderIntelligence(task.recipientEmail, task.recipientName);
  const outreach = await composeOutreach(settings, task, { intelligence: intel.block });
  const send = await sendLivInboxReply({
    itemId: `task-${suffix}`,
    to: task.recipientEmail,
    subject: outreach.subject,
    text: outreach.reply,
  });
  if (send.sent) {
    await rememberSentReply({
      email: task.recipientEmail,
      name: task.recipientName,
      subject: outreach.subject,
      replyBlurb: outreach.reply,
    });
  }

  // Confirm back to the colleague who tasked her.
  await sendLivInboxReply({
    itemId: `task-confirm-${suffix}`,
    to: requester,
    subject: `Klaret: ${task.subject || input.subject}`.slice(0, 180),
    text: [
      'Hej,',
      '',
      send.sent
        ? `Sendt til ${task.recipientName || task.recipientEmail}${send.redirected ? ' (test-redirect)' : ''}.`
        : `Jeg kunne ikke sende endnu (${send.reason}).`,
      `Emne: ${outreach.subject}`,
      '',
      'Kh Liv',
    ].join('\n'),
    inReplyToMessageId: mail.messageId,
  });

  await appendLivInboxAudit({
    type: 'editor_guided',
    contactEmail: task.recipientEmail,
    subject: outreach.subject,
    detail: send.sent
      ? `Udførte opgave (${task.action}) → ${task.recipientEmail}`
      : `Opgave ikke sendt: ${send.reason}`,
    meta: { action: task.action, sent: send.sent },
  });

  return {
    handled: true,
    action: task.action,
    detail: send.sent ? `Sendte ${task.action} til ${task.recipientEmail}` : `Ikke sendt: ${send.reason}`,
  };
}
