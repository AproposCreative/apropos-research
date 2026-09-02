/**
 * Sender intelligence for Liv Indbakke.
 *
 * Before Liv replies she "researches" the sender: who are they, what do we know
 * from our contact database and the shared contacts spreadsheet, and what have we
 * talked about before. After she replies she records the interaction, so she
 * learns who is who over time and never repeats the same answer.
 *
 * Reuses the existing accreditation contact-memory (the `accreditationContacts`
 * database) and the Google Sheet (`ACCREDITATION_SHEET_ID`) so Liv shares one
 * memory of connections and collaborators across the whole studio.
 */
import {
  getContactProfile,
  loadMemoryForReply,
  updateMemoryAfterEvent,
} from '@/lib/accreditation/memory-store';
import type { ContactRelationshipStatus } from '@/lib/accreditation/memory-types';
import type { SheetContact } from '@/lib/accreditation/types';

export const LIV_INBOX_MAILBOX = 'liv@aproposmagazine.com';

export interface SenderIntelligence {
  /** Prompt-ready research block (profile + past conversation + sheet match). */
  block: string;
  /** True when we have seen this contact before. */
  known: boolean;
  /** How many prior interactions we have logged with this contact. */
  priorInteractions: number;
  /** Trust tier from the contact profile (established_two_way / one_way / unknown …). */
  relationshipStatus?: ContactRelationshipStatus;
  /** Short human-facing note for the UI, e.g. "Kendt kontakt · 3 tidligere". */
  note?: string;
}

/** Danish label for a trust tier, for the prompt + UI. */
export function trustTierLabel(status?: ContactRelationshipStatus): string {
  switch (status) {
    case 'established_two_way':
      return 'etableret (to-vejs-dialog)';
    case 'one_way':
      return 'kun én vej indtil videre';
    case 'automated':
      return 'automatisk afsender';
    case 'do_not_contact':
      return 'må ikke kontaktes';
    default:
      return 'ukendt/ny';
  }
}

/** Stable per-contact conversation key for the inbox desk. */
export function inboxConversationKey(email: string): string {
  return `livinbox-${email.trim().toLowerCase()}`;
}

// ---- Contacts spreadsheet (cached, best-effort) ----

let _contactsCache: { at: number; contacts: SheetContact[] } | null = null;
const CONTACTS_TTL_MS = 5 * 60 * 1000;

function sheetCredentialsPresent(): boolean {
  return Boolean(
    (process.env.FIREBASE_ADMIN_CLIENT_EMAIL || '').trim() &&
      (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').trim()
  );
}

/** Read (and cache) the shared contacts sheet. Best-effort: never throws. */
async function loadContactsSheet(): Promise<SheetContact[]> {
  if (!sheetCredentialsPresent()) return [];
  if (_contactsCache && Date.now() - _contactsCache.at < CONTACTS_TTL_MS) {
    return _contactsCache.contacts;
  }
  try {
    const { pullContacts } = await import('@/lib/accreditation/sheet-client');
    const contacts = await pullContacts();
    _contactsCache = { at: Date.now(), contacts };
    return contacts;
  } catch {
    return [];
  }
}

function findSheetContact(contacts: SheetContact[], email: string): SheetContact | undefined {
  const needle = email.trim().toLowerCase();
  return contacts.find((c) => (c.email || '').trim().toLowerCase() === needle);
}

/** Reset the sheet cache (tests). */
export function __resetLivInboxContactCache(): void {
  _contactsCache = null;
}

/**
 * Gather everything Liv should know about a sender before replying.
 * Best-effort and resilient: missing memory or sheet access degrades gracefully.
 */
export async function gatherSenderIntelligence(
  email: string,
  _name?: string
): Promise<SenderIntelligence> {
  const convoKey = inboxConversationKey(email);
  const parts: string[] = [];
  let known = false;
  let priorInteractions = 0;
  let relationshipStatus: ContactRelationshipStatus | undefined;

  // 1) Contact memory (profile + rolling conversation summary)
  try {
    const [memoryBlock, profile] = await Promise.all([
      loadMemoryForReply({ contactEmail: email, requestId: convoKey }),
      getContactProfile(email),
    ]);
    if (memoryBlock) parts.push(memoryBlock);
    if (profile) {
      known = true;
      priorInteractions = profile.interactionCount || 0;
      relationshipStatus = profile.relationshipStatus;
    }
  } catch {
    /* memory unavailable — continue without it */
  }

  // 2) Shared contacts spreadsheet (research)
  try {
    const sheetMatch = findSheetContact(await loadContactsSheet(), email);
    if (sheetMatch) {
      known = true;
      parts.push(
        [
          'Fra kontaktregnearket:',
          `- ${sheetMatch.name || email}${sheetMatch.company ? ` · ${sheetMatch.company}` : ''}`,
          sheetMatch.role ? `- rolle: ${sheetMatch.role}` : null,
          sheetMatch.relationshipStatus ? `- relation: ${sheetMatch.relationshipStatus}` : null,
        ]
          .filter(Boolean)
          .join('\n')
      );
    }
  } catch {
    /* sheet unavailable — continue */
  }

  // Explicit trust signal for both the model and the human reviewer.
  if (relationshipStatus && relationshipStatus !== 'unknown') {
    parts.push(`TILLIDSNIVEAU: ${trustTierLabel(relationshipStatus)}.`);
  }

  const block = parts.join('\n\n');
  const trust =
    relationshipStatus === 'established_two_way'
      ? 'Etableret'
      : relationshipStatus === 'one_way'
        ? 'Kendt (én vej)'
        : known
          ? 'Kendt'
          : 'Ny';
  const note = known
    ? priorInteractions > 0
      ? `${trust} kontakt · ${priorInteractions} tidligere`
      : `${trust} kontakt`
    : 'Ny kontakt';

  return { block, known, priorInteractions, relationshipStatus, note };
}

/**
 * Record the inbound mail and Liv's reply into the shared contact memory, so she
 * learns who is who and does not repeat herself next time.
 */
export async function rememberInboxInteraction(params: {
  email: string;
  name?: string;
  subject?: string;
  inboundBlurb: string;
  replyBlurb?: string;
}): Promise<void> {
  const convoKey = inboxConversationKey(params.email);
  try {
    await updateMemoryAfterEvent({
      requestId: convoKey,
      contactEmail: params.email,
      contactName: params.name,
      direction: 'inbound',
      blurb: params.inboundBlurb.slice(0, 200),
      subject: params.subject,
      sourceMailbox: LIV_INBOX_MAILBOX,
    });
    if (params.replyBlurb) {
      await updateMemoryAfterEvent({
        requestId: convoKey,
        contactEmail: params.email,
        contactName: params.name,
        direction: 'outbound',
        blurb: params.replyBlurb.slice(0, 200),
        subject: params.subject,
        sourceMailbox: LIV_INBOX_MAILBOX,
      });
    }
  } catch {
    /* memory write best-effort — never block the reply on it */
  }
}

/** Record an outbound reply that a human approved and sent. */
export async function rememberSentReply(params: {
  email: string;
  name?: string;
  subject?: string;
  replyBlurb: string;
}): Promise<void> {
  try {
    await updateMemoryAfterEvent({
      requestId: inboxConversationKey(params.email),
      contactEmail: params.email,
      contactName: params.name,
      direction: 'outbound',
      blurb: params.replyBlurb.slice(0, 200),
      subject: params.subject,
      sourceMailbox: LIV_INBOX_MAILBOX,
    });
  } catch {
    /* best-effort */
  }
}
