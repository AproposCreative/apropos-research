import type { SocialPublishReceipt } from './publish-types';

export function sortSocialReceipts(receipts: SocialPublishReceipt[]) {
  return [...receipts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Interpret old receipts without rewriting their original provider evidence. */
export function facebookCommentNotice(receipt: SocialPublishReceipt) {
  if (!receipt.channels.facebook || receipt.facebook.status !== 'published' || receipt.comment.status === 'published') return null;
  const comment = receipt.comment;
  const permission = comment.status === 'failed' && ([10, 200].includes(comment.errorCode ?? 0) || /\(kode (10|200)\)/.test(comment.error ?? ''));
  if (permission) return { settings: true, text: 'Artikellinket blev ikke tilføjet som Facebook-kommentar. Facebook mangler adgang til kommentarer.' };
  if (comment.status === 'failed') return { settings: false, text: 'Facebook-opslaget er udgivet. Kommentaren med artikellinket blev afvist.' };
  return { settings: false, text: 'Facebook-opslaget er udgivet. Kommentaren med artikellinket er endnu ikke bekræftet.' };
}
