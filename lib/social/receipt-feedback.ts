import type { SocialPublishReceipt } from './publish-types';

export function sortSocialReceipts(receipts: SocialPublishReceipt[]) {
  return [...receipts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Interpret old receipts without rewriting their original provider evidence. */
export function facebookCommentNotice(receipt: SocialPublishReceipt) {
  if (!receipt.channels.facebook || receipt.facebook.status !== 'published' || ['published', 'skipped'].includes(receipt.comment.status)) return null;
  const comment = receipt.comment;
  if (comment.status === 'failed') return { text: 'Tidligere forsøg: Facebook-kommentaren med artikellinket blev afvist. Opslaget er udgivet.' };
  return { text: 'Tidligere forsøg: Facebook-kommentaren med artikellinket er ikke bekræftet. Opslaget er udgivet.' };
}
