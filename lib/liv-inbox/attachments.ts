/**
 * Attachment handling for Liv Indbakke.
 *
 * We only ever look at attachment METADATA (filename, content-type, size) — never
 * the bytes — for privacy and cost. From that we decide:
 *  - invoice/payment/contract-like files => ALWAYS escalate to a human,
 *  - press kits / images => note them and answer relevantly.
 */
export interface LivAttachmentMeta {
  filename: string;
  contentType?: string;
  size?: number;
}

export interface LivAttachmentAssessment {
  /** Human-readable per-attachment labels for the prompt/UI. */
  summaries: string[];
  /** True when an attachment looks financial/legal → force escalation. */
  forceEscalate: boolean;
  /** Short note for the audit/contact line (e.g. "Pressekit vedhæftet"). */
  note?: string;
}

const INVOICE_RX = /faktura|invoice|rykker|betaling|kreditnota|regning|paymen|overdue|kontoudtog|kontrakt|contract|nda/i;
const PRESSKIT_RX = /presse?kit|press[\s_-]?kit|pressemeddelelse|onesheet|one[\s_-]?sheet|epk|rider/i;
const IMAGE_EXT_RX = /\.(png|jpe?g|gif|webp|tiff?|heic)$/i;

export function assessLivAttachments(attachments?: LivAttachmentMeta[]): LivAttachmentAssessment {
  if (!attachments || attachments.length === 0) {
    return { summaries: [], forceEscalate: false };
  }

  const summaries: string[] = [];
  let forceEscalate = false;
  let sawPressKit = false;
  let sawImage = false;

  for (const a of attachments) {
    const name = (a.filename || '(uden navn)').slice(0, 160);
    const hay = `${name} ${a.contentType || ''}`;
    let label = 'fil';
    if (INVOICE_RX.test(hay)) {
      label = 'faktura/betaling/kontrakt';
      forceEscalate = true;
    } else if (PRESSKIT_RX.test(hay)) {
      label = 'pressekit';
      sawPressKit = true;
    } else if (IMAGE_EXT_RX.test(name) || /^image\//i.test(a.contentType || '')) {
      label = 'billede';
      sawImage = true;
    } else if (/\.pdf$/i.test(name) || /pdf/i.test(a.contentType || '')) {
      label = 'pdf-dokument';
    }
    const size = a.size ? ` ~${Math.max(1, Math.round(a.size / 1024))} KB` : '';
    summaries.push(`${name} (${label}${size})`);
  }

  let note: string | undefined;
  if (forceEscalate) note = 'Faktura/betaling/kontrakt vedhæftet';
  else if (sawPressKit) note = 'Pressekit vedhæftet';
  else if (sawImage) note = 'Billeder vedhæftet';

  return { summaries, forceEscalate, note };
}

/** Map raw MIME attachments to lightweight metadata (drops the buffers). */
export function toAttachmentMeta(
  raw?: Array<{ filename?: string; contentType?: string; content?: Buffer | Uint8Array }>
): LivAttachmentMeta[] {
  if (!raw || raw.length === 0) return [];
  return raw
    .filter((a) => a && (a.filename || a.contentType))
    .map((a) => ({
      filename: (a.filename || '(uden navn)').slice(0, 160),
      contentType: a.contentType,
      size: a.content ? a.content.length : undefined,
    }));
}
