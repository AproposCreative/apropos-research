import { simpleParser, type ParsedMail, type AddressObject } from 'mailparser';
import type { ParsedInboundMail } from '@/lib/accreditation/imap/correlate';

function addressesFrom(field: AddressObject | AddressObject[] | undefined): string[] {
  if (!field) return [];
  const list = Array.isArray(field) ? field : [field];
  const out: string[] = [];
  for (const a of list) {
    for (const v of a.value || []) {
      if (v.address) out.push(v.address);
    }
  }
  return out;
}

function firstAddress(field: AddressObject | AddressObject[] | undefined): {
  email: string;
  name?: string;
} {
  const list = Array.isArray(field) ? field : field ? [field] : [];
  const v = list[0]?.value?.[0];
  return {
    email: (v?.address || '').trim().toLowerCase(),
    name: v?.name || undefined,
  };
}

export function headersToMap(parsed: ParsedMail): Record<string, string> {
  const out: Record<string, string> = {};
  if (!parsed.headers) return out;
  for (const [key, value] of parsed.headers) {
    const k = String(key).toLowerCase();
    if (typeof value === 'string') out[k] = value;
    else if (Array.isArray(value)) out[k] = value.map(String).join(', ');
    else if (value != null) out[k] = String(value);
  }
  return out;
}

export async function parseRawMime(source: Buffer | string): Promise<ParsedInboundMail> {
  const parsed = await simpleParser(source);
  const from = firstAddress(parsed.from);
  const to = [
    ...addressesFrom(parsed.to),
    ...addressesFrom(parsed.cc),
    ...addressesFrom(
      parsed.headers?.get('delivered-to')
        ? ({
            value: [{ address: String(parsed.headers.get('delivered-to')) }],
          } as AddressObject)
        : undefined
    ),
  ];

  const refsRaw = parsed.references;
  const references = Array.isArray(refsRaw)
    ? refsRaw.map(String)
    : refsRaw
      ? [String(refsRaw)]
      : [];

  const text =
    (typeof parsed.text === 'string' && parsed.text.trim()) ||
    (typeof parsed.html === 'string'
      ? parsed.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : '');

  const attachments = (parsed.attachments || [])
    .filter((a) => a.content && Buffer.isBuffer(a.content) && a.content.length > 0)
    .map((a) => ({
      filename: a.filename || a.cid || 'attachment',
      contentType: a.contentType || undefined,
      content: a.content as Buffer,
    }));

  return {
    messageId: parsed.messageId || undefined,
    inReplyTo: parsed.inReplyTo || undefined,
    references,
    fromEmail: from.email,
    fromName: from.name,
    toAddresses: to,
    subject: parsed.subject || '(uden emne)',
    text,
    html: typeof parsed.html === 'string' ? parsed.html : undefined,
    date: parsed.date ? parsed.date.toISOString() : undefined,
    headers: headersToMap(parsed),
    attachments: attachments.length ? attachments : undefined,
  };
}
