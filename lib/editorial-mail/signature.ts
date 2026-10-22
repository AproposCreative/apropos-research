import { cmsFieldHash as hash } from '@/lib/liv/cms-field-hash';
import { getLivInboxSettings } from '@/lib/liv-inbox/settings-store';
import type { MailboxId } from '@/lib/accreditation/imap/config';

// Existing, tracked ORIGINAL brand asset; HTTPS bytes verified against the file.
export const SIGNATURE_LOGO = 'https://ai.aproposmagazine.com/images/apropos-newsletter-logo.png';
export const FREDERIK_SIGNATURE = 'Venlig hilsen / Best regards\n\nFrederik Emil Kragh\nEditor-in-chief\n+45 31 10 31 17\nAproposmagazine.com / Apropos Editions\n\nApropos Magazine\nFlæsketorvet 26-28\n1711 København V';
export const escapeMailHtml = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export type Signature = { version: string; hash: string; text: string; html: string; logoUrl: string | null };
export async function currentSignature(mailbox: MailboxId): Promise<Signature> {
  const text = mailbox === 'frederik' ? FREDERIK_SIGNATURE : (await getLivInboxSettings()).signature.trim();
  const logoUrl = mailbox === 'frederik' ? SIGNATURE_LOGO : null;
  const html = mailbox === 'frederik' ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#171717;background:#ffffff;padding:16px 0;max-width:480px">Venlig hilsen / Best regards<br><br><strong>Frederik Emil Kragh</strong><br>Editor-in-chief<br><a href="tel:+4531103117" style="color:#171717">+45 31 10 31 17</a><br><a href="https://aproposmagazine.com" style="color:#171717">Aproposmagazine.com</a> / Apropos Editions<br><br><img src="${SIGNATURE_LOGO}" alt="Apropos Magazine" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0;margin:0 0 8px"><span>Apropos Magazine<br>Flæsketorvet 26-28<br>1711 København V</span></div>`
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap">${escapeMailHtml(text)}</div>`;
  return { version: 'mail-signature-2026-10-22-v1', text, html, logoUrl, hash: hash({ text, html, logoUrl }) };
}
export function applySignature(input: string, signature: Signature, old?: Signature) {
  let body = input.trim();
  // Remove only exact known trailing signatures, never arbitrary prose or quotations.
  const known = [...new Set([signature.text, old?.text, 'Bedste hilsner\nFrederik Kragh\nApropos Magazine'].filter(Boolean) as string[])];
  for (let i=0; i<3; i++) for (const suffix of known) if (body.endsWith(`\n\n${suffix}`)) body = body.slice(0,-suffix.length).trimEnd();
  const text = `${body}\n\n${signature.text}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#171717;background:#ffffff;white-space:pre-wrap">${escapeMailHtml(body)}</div>${signature.html}`;
  return { body: text, bodyText: body, html, signature };
}
