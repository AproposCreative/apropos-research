/** Read-only diagnostic text, deliberately not an Article/CMS payload. */
export interface BlockedSourceReview {
  status: 'blocked';
  text: string;
  textHash: string;
  model: string;
  voiceVersion: string;
}

export function readBlockedSourceReview(value: unknown): BlockedSourceReview | null {
  if (!value || typeof value !== 'object') return null;
  const envelope = value as Record<string, unknown>;
  if (envelope.ok !== false || envelope.gatePass !== false || envelope.canAutoPublish !== false
    || !['source_similarity_unapproved', 'source_similarity_incomplete'].includes(String(envelope.code))) return null;
  const row = envelope.blockedReview as Partial<BlockedSourceReview> | undefined;
  if (!row || row.status !== 'blocked' || typeof row.text !== 'string' || row.text.length > 60000
    || !row.text.trim() || typeof row.textHash !== 'string' || !/^[a-f0-9]{64}$/.test(row.textHash)
    || typeof row.model !== 'string' || typeof row.voiceVersion !== 'string') return null;
  return { status: 'blocked', text: row.text, textHash: row.textHash, model: row.model, voiceVersion: row.voiceVersion };
}
