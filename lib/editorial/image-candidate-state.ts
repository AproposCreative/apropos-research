import type { DocumentData } from 'firebase-admin/firestore';

/** A status flag alone must never dismiss a pending choice. The exact-file
 * personal receipt is retained with the original, including its old version. */
export function isDeclinedImageCandidate(asset: DocumentData) {
  const receipt = asset.personalDecline;
  return asset.status === 'declined' && !!asset.importInput && !asset.personalSelection &&
    receipt?.source === 'personal-preview' && receipt.uid === asset.uid &&
    receipt.submissionId === asset.submissionId && receipt.assetId === asset.assetId &&
    receipt.originalHash === asset.originalHash && receipt.revision === asset.expectedRevision &&
    receipt.contentHash === asset.contentHash && receipt.protectedContentHash === asset.protectedContentHash;
}

export function isPendingImageCandidate(asset: DocumentData) {
  return !!asset.importInput && asset.status !== 'attached' && !isDeclinedImageCandidate(asset);
}

export function declinedPlacementImages(assets: DocumentData[], uid: string, submissionId: string, role: string, sectionId?: string) {
  return assets.filter(a => a.uid === uid && a.submissionId === submissionId && a.role === role &&
    a.sectionId === sectionId && isDeclinedImageCandidate(a))
    .map(a => ({ assetId: String(a.assetId), originalHash: String(a.originalHash) }))
    .sort((a, b) => a.assetId.localeCompare(b.assetId));
}
