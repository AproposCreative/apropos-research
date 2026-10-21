import { env } from '@/lib/config/env';
import { getSheetsAccessToken } from '@/lib/accreditation/sheet-auth';
import {
  DEFAULT_CONTACTS_TAB,
  DEFAULT_MAILBOX_ARCHIVE_TAB,
  DEFAULT_SHEET_ID,
  DEFAULT_WORKFLOW_TAB,
  WORKFLOW_SHEET_HEADERS,
  type AccreditationRequest,
  type MailboxArchiveContact,
  type SheetContact,
  type WorkflowSheetRow,
} from '@/lib/accreditation/types';
import { STATUS_LABELS_DA } from '@/lib/accreditation/state-machine';
import { isAutomatedSenderHeuristic } from '@/lib/accreditation/memory-types';

function sheetId(): string {
  return (
    env.ACCREDITATION_SHEET_ID ||
    process.env.ACCREDITATION_SHEET_ID ||
    DEFAULT_SHEET_ID
  ).trim();
}

function workflowTab(): string {
  return (
    env.ACCREDITATION_SHEET_TAB ||
    process.env.ACCREDITATION_SHEET_TAB ||
    DEFAULT_WORKFLOW_TAB
  ).trim();
}

/** Exact contacts tab name — read-only. */
export function contactsTab(): string {
  return (
    env.ACCREDITATION_CONTACTS_TAB ||
    process.env.ACCREDITATION_CONTACTS_TAB ||
    DEFAULT_CONTACTS_TAB
  ).trim();
}

/** Read-only mailbox archive tab (deduplicated contacts from one.com). */
export function mailboxArchiveTab(): string {
  return (
    process.env.ACCREDITATION_MAILBOX_ARCHIVE_TAB ||
    DEFAULT_MAILBOX_ARCHIVE_TAB
  ).trim();
}

function encodeRange(tab: string, range: string): string {
  return encodeURIComponent(`'${tab.replace(/'/g, "''")}'!${range}`);
}

async function sheetsFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getSheetsAccessToken();
  return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

function cell(row: string[], index: number): string {
  if (index < 0) return '';
  return (row[index] || '').trim();
}

const normalizedWorkflowHeader = (h: string) => h.trim().toLowerCase().replace(/\s*\/\s*/g, '/');
export function parseWorkflowRows(values: string[][]): WorkflowSheetRow[] {
  if (!values.length) return [];
  const header = values[0].map(normalizedWorkflowHeader);
  const indexOf = (name: string) => header.findIndex((h) => h === normalizedWorkflowHeader(name));
  if (new Set(header.filter(Boolean)).size !== header.filter(Boolean).length) throw new Error('Accreditation workflow har tvetydige kolonneoverskrifter');

  const idxs = WORKFLOW_SHEET_HEADERS.map((h) => indexOf(h));
  // Require at least Request ID + Artist
  if (idxs[0] < 0 || idxs[1] < 0) {
    throw new Error('Accreditation workflow mangler forventede kolonneoverskrifter');
  }

  const rows: WorkflowSheetRow[] = [];
  for (let i = 1; i < values.length; i++) {
    const raw = values[i];
    const requestId = cell(raw, idxs[0]);
    if (!requestId) continue;
    rows.push({
      requestId,
      artist: cell(raw, idxs[1]),
      venue: cell(raw, idxs[2] >= 0 ? idxs[2] : -1),
      eventDate: cell(raw, idxs[3] >= 0 ? idxs[3] : -1),
      applicants: cell(raw, idxs[4] >= 0 ? idxs[4] : -1),
      number: cell(raw, idxs[5] >= 0 ? idxs[5] : -1),
      accessRequested: cell(raw, idxs[6] >= 0 ? idxs[6] : -1),
      promoter: cell(raw, idxs[7] >= 0 ? idxs[7] : -1),
      contactName: cell(raw, idxs[8] >= 0 ? idxs[8] : -1),
      contactEmail: cell(raw, idxs[9] >= 0 ? idxs[9] : -1),
      senderMailbox: cell(raw, idxs[10] >= 0 ? idxs[10] : -1),
      status: cell(raw, idxs[11] >= 0 ? idxs[11] : -1),
      lastAction: cell(raw, idxs[12] >= 0 ? idxs[12] : -1),
      nextFollowUp: cell(raw, idxs[13] >= 0 ? idxs[13] : -1),
      outcomeReason: cell(raw, idxs[14] >= 0 ? idxs[14] : -1),
      emailThreadSource: cell(raw, idxs[15] >= 0 ? idxs[15] : -1),
      notes: cell(raw, idxs[16] >= 0 ? idxs[16] : -1),
      rowNumber: i + 1,
    });
  }
  return rows;
}

export async function pullWorkflowRows(options: { allRows?: boolean; requireColumnOrder?: boolean } = {}): Promise<WorkflowSheetRow[]> {
  const res = await sheetsFetch(`/values/${encodeRange(workflowTab(), options.allRows ? 'A:Q' : 'A1:Q500')}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets workflow read failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  if(options.requireColumnOrder && WORKFLOW_SHEET_HEADERS.some((h,i)=>normalizedWorkflowHeader(data.values?.[0]?.[i]||'')!==normalizedWorkflowHeader(h)))
    throw Error('Sheets workflow column order changed; no write performed');
  return parseWorkflowRows(data.values || []);
}

/**
 * Read-only: Contacts etc. Never write to this tab.
 */
export async function pullContacts(options: { allRows?: boolean } = {}): Promise<SheetContact[]> {
  const tab = contactsTab();
  const res = await sheetsFetch(`/values/${encodeRange(tab, options.allRows ? 'A:AZ' : 'A1:AZ500')}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets contacts read failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  return parseContactSheetRows(data.values || []);
}

/** Danish and English source headers; no guessed email or permission. Preserve every cell. */
export function parseContactSheetRows(values: string[][]): SheetContact[] {
  if (values.length < 2) return [];
  const headers = values[0].map(h => h.trim().toLowerCase());
  const nameIdx = headers.findIndex(h => /^(name|navn|contact|contact name|kontakt|kontaktperson)$/.test(h));
  const companyIdx = headers.findIndex(h => /company|firma|promoter|media|venue|org|festival/.test(h));
  const roleIdx = headers.findIndex(h => /role|rolle|titel|funktion/.test(h));
  const emailIdx = headers.findIndex(h => /email|mail|e-mail|kontaktinformation/.test(h));
  const relationIdx = headers.findIndex(h => /relation/.test(h));
  const permissionIdx = headers.findIndex(h => /må kontaktes|maa kontaktes|contact.?allowed/.test(h));
  const contacts: SheetContact[] = [];
  let precedingFestival='';
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const raw = sheetRowFacts(values[0], row, i + 1);
    if(headers[companyIdx]==='festival') {
      if(cell(row,companyIdx)) precedingFestival=cell(row,companyIdx);
      else if(precedingFestival) raw['Preceding festival heading (unverified context)']=precedingFestival;
    }
    const name = cell(row, nameIdx), company = cell(row, companyIdx), permission = cell(row, permissionIdx).toLowerCase();
    const emails = [...new Set((cell(row, emailIdx).match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi) || []).map(s=>s.toLowerCase()))];
    if (!row.some(v => v.trim())) continue;
    const relation = /^(nej|no|false|0)(\b|$)|kontakt ikke|do.?not.?contact|fravalgt/.test(permission) ? 'do_not_contact' : cell(row, relationIdx) || undefined;
    for (const email of emails.length ? emails : [undefined]) contacts.push({ name: name || company || email || `Kilderække ${i+1}`, company: company || undefined,
      role: cell(row, roleIdx) || undefined, email, relationshipStatus: relation, raw });
  }
  return contacts;
}

function sheetRowFacts(headers: string[], row: string[], rowNumber: number): Record<string,string> {
  const facts: Record<string,string> = { sourceRow: String(rowNumber) };
  for(let i=0;i<Math.max(headers.length,row.length);i++) {
    const base=headers[i]?.trim() || `Column ${i+1}`;
    const label=Object.hasOwn(facts,base)?`${base} [column ${i+1}]`:base;
    facts[label]=(row[i]||'').trim();
  }
  return facts;
}

export const ADDITIONAL_ACCREDITATION_SOURCES = [
  {source:'priority_ticket_contacts',tab:'Vigtige billetkontakter',kind:'contact'},
  {source:'danish_contact_bank',tab:'Dansk kontaktbank',kind:'contact'},
  {source:'milo_opportunities',tab:'Milo, Muligheder',kind:'event_opportunity'},
] as const;
export async function pullAdditionalAccreditationSource(source: typeof ADDITIONAL_ACCREDITATION_SOURCES[number]) {
  const res=await sheetsFetch(`/values/${encodeRange(source.tab,'A:AZ')}`);
  if(!res.ok) throw Error(`Sheets additional source read failed: ${res.status}`);
  const {values=[]}=await res.json() as {values?:string[][]};
  if(source.kind==='contact') return parseContactSheetRows(values);
  // This tab has two side-by-side event lists. Preserve duplicate headers and all cells,
  // never manufacture a contact or treat an old event/date as current research.
  return values.slice(1).flatMap((row,i)=>row.some(v=>v.trim())?[{name:[row[1],row[6]].filter(Boolean).join(' / ')||`Mulighed ${i+2}`,
    company:[row[3],row[8]].filter(Boolean).join(' / '),raw:sheetRowFacts(values[0]||[],row,i+2)}]:[]) as SheetContact[];
}

/**
 * Parse Mailbox contact archive values (header-flexible).
 * Never write to this tab.
 */
export function parseMailboxArchiveRows(values: string[][]): MailboxArchiveContact[] {
  if (values.length < 2) return [];
  const headers = values[0].map((h) => h.trim().toLowerCase());
  const find = (...patterns: RegExp[]) =>
    headers.findIndex((h) => patterns.some((p) => p.test(h)));

  const emailIdx = find(/email/, /e-mail/, /mailadresse/, /^mail$/);
  const nameIdx = find(/^name$/, /navn/, /contact name/, /display/);
  const companyIdx = find(/company/, /firma/, /org/, /promoter/, /venue/);
  const domainIdx = find(/domain/, /domæne/);
  const roleIdx = find(/role/, /titel/, /funktion/);
  const categoryIdx = find(/categor/, /type/, /kind/, /klasse/);
  const relationshipIdx = find(/relation/, /dialogue/, /dialog/, /status/);
  const mailboxIdx = find(/mailbox/, /source/, /kilde/, /inbox/);
  const countIdx = find(/count/, /messages?/, /antal/, /interactions?/);
  const replyIdx = find(/reply/, /replied/, /two.?way/, /svar/);
  const firstIdx = find(/first.?seen/, /første/);
  const lastIdx = find(/last.?seen/, /sidste/, /last.?contact/);
  const subjectIdx = find(/subject/, /emne/, /recent/);
  const notesIdx = find(/notes?/, /noter/, /comment/);
  const automatedIdx = find(/automat/, /noreply/, /bot/, /system/);

  const out: MailboxArchiveContact[] = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) raw[h] = (row[idx] || '').trim();
    });
    const email = (emailIdx >= 0 ? row[emailIdx] : '').trim().toLowerCase();
    const name = (nameIdx >= 0 ? row[nameIdx] : '').trim();
    if (!email && !name) continue;

    const category = categoryIdx >= 0 ? (row[categoryIdx] || '').trim() : '';
    const relationship = relationshipIdx >= 0 ? (row[relationshipIdx] || '').trim() : '';
    const autoCell = automatedIdx >= 0 ? (row[automatedIdx] || '').trim() : '';
    const replyCell = replyIdx >= 0 ? (row[replyIdx] || '').trim() : '';
    const countRaw = countIdx >= 0 ? (row[countIdx] || '').trim() : '';
    const messageCount = countRaw ? Number(countRaw.replace(/[^\d]/g, '')) || 0 : undefined;

    const isAutomated =
      /^(1|true|yes|ja|auto)/i.test(autoCell) ||
      isAutomatedSenderHeuristic({
        email,
        name,
        category,
        role: roleIdx >= 0 ? row[roleIdx] : undefined,
        rawText: Object.values(raw).join(' '),
      });

    out.push({
      email: email || undefined,
      name: name || undefined,
      company: companyIdx >= 0 ? (row[companyIdx] || '').trim() || undefined : undefined,
      domain: domainIdx >= 0 ? (row[domainIdx] || '').trim() || undefined : undefined,
      role: roleIdx >= 0 ? (row[roleIdx] || '').trim() || undefined : undefined,
      category: category || undefined,
      relationship: relationship || undefined,
      sourceMailbox: mailboxIdx >= 0 ? (row[mailboxIdx] || '').trim() || undefined : undefined,
      messageCount,
      hasReply: /^(1|true|yes|ja|two)/i.test(replyCell) || /two.?way|established/i.test(relationship),
      firstSeenAt: firstIdx >= 0 ? (row[firstIdx] || '').trim() || undefined : undefined,
      lastSeenAt: lastIdx >= 0 ? (row[lastIdx] || '').trim() || undefined : undefined,
      recentSubject: subjectIdx >= 0 ? (row[subjectIdx] || '').trim() || undefined : undefined,
      notes: notesIdx >= 0 ? (row[notesIdx] || '').trim() || undefined : undefined,
      isAutomated,
      raw,
      rowNumber: i + 1,
    });
  }
  return out;
}

/**
 * Read-only: Mailbox contact archive. Never write to this tab.
 */
export async function pullMailboxContactArchive(options: { allRows?: boolean } = {}): Promise<MailboxArchiveContact[]> {
  const tab = mailboxArchiveTab();
  const res = await sheetsFetch(`/values/${encodeRange(tab, options.allRows ? 'A:Z' : 'A1:Z500')}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets mailbox archive read failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  return parseMailboxArchiveRows(data.values || []);
}

export function requestToWorkflowValues(
  request: AccreditationRequest,
  extras?: {
    lastAction?: string;
    nextFollowUp?: string;
    emailThreadSource?: string;
  }
): string[] {
  return [
    request.id,
    request.artist,
    request.venue || '',
    request.eventDate || '',
    request.applicants.map((a) => a.name).join(', '),
    String(request.ticketQuantity ?? request.applicants.length ?? ''),
    request.accessRequested || '',
    request.promoter || '',
    request.contactName || '',
    request.contactEmail || '',
    request.senderMailbox,
    STATUS_LABELS_DA[request.status] || request.status,
    extras?.lastAction || '',
    extras?.nextFollowUp || '',
    request.outcomeReason || '',
    extras?.emailThreadSource || '',
    request.notes || '',
  ];
}

/** Upsert a single row on Accreditation workflow only (never Contacts etc.). */
export async function syncRequestToSheet(
  request: AccreditationRequest,
  extras?: {
    lastAction?: string;
    nextFollowUp?: string;
    emailThreadSource?: string;
  }
): Promise<{ rowNumber: number }> {
  const values = requestToWorkflowValues(request, extras);
  const existing = await pullWorkflowRows({ allRows: true, requireColumnOrder:true });
  // MCP text is untrusted prose, never an executable spreadsheet formula.
  const valueInputOption = request.mcp ? 'RAW' : 'USER_ENTERED';
  const matches=existing.filter(r=>r.requestId===request.id);
  if(matches.length>1) throw Error('Sheets workflow duplicate request ID; no write performed');
  const match = matches[0];

  if (match) {
    const range = encodeRange(workflowTab(), `A${match.rowNumber}:Q${match.rowNumber}`);
    const res = await sheetsFetch(`/values/${range}?valueInputOption=${valueInputOption}`, {
      method: 'PUT',
      body: JSON.stringify({ values: [values] }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Sheets update failed: ${res.status} ${body.slice(0, 200)}`);
    }
    return { rowNumber: match.rowNumber };
  }

  const res = await sheetsFetch(
    `/values/${encodeRange(workflowTab(), 'A:Q')}:append?valueInputOption=${valueInputOption}&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      body: JSON.stringify({ values: [values] }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets append failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { updates?: { updatedRange?: string } };
  const updated = data.updates?.updatedRange || '';
  const rowMatch = updated.match(/!A(\d+)/);
  return { rowNumber: rowMatch ? Number(rowMatch[1]) : 0 };
}

export async function checkSheetConnection(): Promise<{
  ok: boolean;
  error?: string;
  workflowRows?: number;
  contactsRows?: number;
  mailboxArchiveRows?: number;
}> {
  try {
    const [workflow, contacts, archive] = await Promise.all([
      pullWorkflowRows(),
      pullContacts(),
      pullMailboxContactArchive().catch(() => [] as MailboxArchiveContact[]),
    ]);
    return {
      ok: true,
      workflowRows: workflow.length,
      contactsRows: contacts.length,
      mailboxArchiveRows: archive.length,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
