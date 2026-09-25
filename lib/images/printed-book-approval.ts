import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
/** Not a text-free verdict: explicit owner choice to retain printed book art.
 * Byte-bound, Admin-only, and backed by the immutable original review approval. */
export async function readPrintedBookApproval(bytes: Buffer) {
  const db=getAdminDb(); if(!db)return null;
  const contentHash=digest(bytes), record=(await db.collection('printedBookImageApprovals').doc(contentHash).get()).data();
  if(!record)return null;
  if(record.contentHash!==contentHash || record.kind!=='owner-selected-printed-book' ||
    !/^reserve-editorial-20\d{2}-\d{2}-\d{2}$/.test(record.runId || '') ||
    !/^[a-zA-Z0-9_-]{8,100}$/.test(record.approvalId || '') || !/^[a-f0-9]{64}$/.test(record.rootContentHash || '')) throw Error('printed_book_approval_invalid');
  const audit=(await db.collection('livDailyArticles').doc(record.runId).collection('suppliedApprovals').doc(record.approvalId).get()).data();
  if(!audit?.approval || audit.approval.authority!=='owner-approved-original-review' || !audit.approval.ownerUid ||
    audit.approvalHash!==cmsFieldHash(audit.approval) || record.approvalHash!==audit.approvalHash ||
    audit.suppliedCover?.contentHash!==record.rootContentHash || audit.suppliedCover?.printedBookTitlePreserved!==true) throw Error('printed_book_approval_invalid');
  return record;
}

/** Called only immediately after deterministic WebP encoding of these source
 * bytes. Derived sizes keep the specific artwork permission, never an AI pass. */
export async function inheritPrintedBookApproval(source: Buffer, encoded: Buffer) {
  const original=await readPrintedBookApproval(source);if(!original)return;
  const contentHash=digest(encoded);if(contentHash===original.contentHash)return;
  const db=getAdminDb()!;
  await db.runTransaction(async tx=>{
    const ref=db.collection('printedBookImageApprovals').doc(contentHash), prior=(await tx.get(ref)).data();
    if(prior)return;
    tx.create(ref,{...original,contentHash,parentContentHash:original.contentHash,createdAt:new Date().toISOString()});
  });
}
