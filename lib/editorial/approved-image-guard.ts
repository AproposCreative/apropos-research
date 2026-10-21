import type { Transaction, DocumentData } from 'firebase-admin/firestore';
import { articleImages } from '@/lib/mcp/markup';
import { submissionStore } from './submissions';
import type { SubmissionRecord } from './submission-contract';
import { assertExistingCoverReplacement } from './existing-cover-exception';

/** Approval is durable, not a transient current-revision flag. Also cover old
 * preparation-only approvals and personal image selections after text edits.
 * Called before upload AND inside the final article transaction. */
export async function assertNoApprovedImageReplacement(row: SubmissionRecord, removedUrls: string[], tx?: Transaction,
  existingCover?: { assetId: string; url: string }) {
  if (existingCover) {
    await assertExistingCoverReplacement(row, removedUrls, existingCover, tx);
    return;
  }
  if (!removedUrls.length) return;
  const ref = submissionStore().collection.doc(row.id), protectedUrls = new Set<string>();
  const protectVersion = (version: DocumentData) => {
    if (!version.approval?.acceptedAt || version.approval.contentHash !== version.contentHash) return;
    for (const article of [version.article, version.prepared?.expected]) {
      if (article?.featuredImage) protectedUrls.add(article.featuredImage);
      for (const image of articleImages(article?.content || '')) protectedUrls.add(image.url);
    }
  };
  protectVersion(row);
  for (const name of ['publicationConsents', 'mediaSelections', 'versions']) {
    const query = ref.collection(name).limit(101), results = await (tx ? tx.get(query) : query.get());
    if (results.size > 100) throw Error('mcp_submission_approval_history_window_exceeded');
    for (const doc of results.docs) {
      const saved = doc.data();
      if (saved.uid !== row.uid) continue;
      if (name === 'versions') protectVersion(saved);
      else if (saved.acceptedAt) for (const media of saved.media || saved.items || []) if (media.url) protectedUrls.add(media.url);
    }
  }
  if (removedUrls.some(url => protectedUrls.has(url))) throw Error('mcp_submission_approved_image_locked');
}
