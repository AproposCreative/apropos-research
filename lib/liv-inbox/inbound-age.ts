/**
 * Age gate so Liv never auto-sends to old mailbox mail if a cursor is lost.
 * Matches accreditation's 24h historical skip.
 */
export const LIV_INBOX_MAX_INBOUND_AGE_MS = 24 * 60 * 60 * 1000;

/** True when the MIME Date is older than the inbound age window. Missing dates are not historical. */
export function isHistoricalLivInbound(
  mail: { date?: string },
  nowMs = Date.now()
): boolean {
  if (!mail.date) return false;
  const receivedMs = Date.parse(mail.date);
  if (!Number.isFinite(receivedMs)) return false;
  return receivedMs < nowMs - LIV_INBOX_MAX_INBOUND_AGE_MS;
}

export type LivInboxFetchPlan =
  | { kind: 'baseline'; baselineUid: number }
  | { kind: 'rebaseline'; baselineUid: number }
  | { kind: 'fetch'; fromUid: number };

/** Refuse to replay a large UID gap (lost/reset cursor). */
const MAX_UID_GAP = 200;

/**
 * Decide whether to baseline (skip existing inbox) or fetch only UIDs after the cursor.
 * lastUid <= 0 means this desk has never been activated against IMAP.
 */
export function resolveLivInboxFetchPlan(lastUid: number, uidNext: number): LivInboxFetchPlan {
  const end = Math.max(0, Math.floor(uidNext) - 1);
  if (lastUid <= 0) {
    return { kind: 'baseline', baselineUid: end };
  }
  if (end > lastUid && end - lastUid > MAX_UID_GAP) {
    return { kind: 'rebaseline', baselineUid: end };
  }
  return { kind: 'fetch', fromUid: lastUid + 1 };
}
