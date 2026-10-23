import { getAdminStorageBucket } from '@/lib/firebase-admin';
import { mimeHash } from '@/lib/editorial-mail/imap';

const pathFor = (approvalId: string, revision: number, sha256: string) =>
  `private-accreditation-sent/${approvalId}/${revision}/${sha256}.eml`;

/** Save the exact bytes before SMTP. A failure here must prevent sending. */
export async function preserveAccreditationMime(approvalId: string, revision: number, raw: Buffer, sha256: string) {
  if (mimeHash(raw) !== sha256) throw Error('mcp_accreditation_mime_changed');
  const bucket = getAdminStorageBucket(process.env.FIREBASE_ADMIN_STORAGE_BUCKET);
  if (!bucket) throw Error('mcp_accreditation_mime_storage_unavailable');
  const path = pathFor(approvalId, revision, sha256), file = bucket.file(path);
  await file.save(raw, { resumable: false, contentType: 'message/rfc822',
    preconditionOpts: { ifGenerationMatch: 0 } });
  return { path, sha256, byteLength: raw.length };
}

export async function readAccreditationMime(record: { path: string; sha256: string; byteLength: number }, approvalId: string, revision: number) {
  if (record.path !== pathFor(approvalId, revision, record.sha256)) throw Error('mcp_accreditation_mime_changed');
  const bucket = getAdminStorageBucket(process.env.FIREBASE_ADMIN_STORAGE_BUCKET);
  if (!bucket) throw Error('mcp_accreditation_mime_storage_unavailable');
  const [raw] = await bucket.file(record.path).download();
  if (raw.length !== record.byteLength || mimeHash(raw) !== record.sha256) throw Error('mcp_accreditation_mime_changed');
  return raw as Buffer;
}
