import { readSubmission, submissionStore } from './submissions';
import { readImageGenSnapshot } from '@/lib/image-gen/snapshot';
import { importSuppliedImage } from './chat-image-import';
import { EXISTING_COVER_AUTHORIZATION as permit } from './existing-cover-authorization';
import { assertExistingCoverBytes, existingCoverAssetId } from './existing-cover-exception';

/** Private staging only. Never creates a personal choice or publication consent. */
export async function stageExistingCover(uid: string, revision: number, bytes: Buffer) {
  if (uid !== permit.uid) throw Error('mcp_submission_existing_cover_not_authorized');
  assertExistingCoverBytes(bytes);
  const row = await readSubmission(uid, permit.submissionId);
  if (row.revision !== revision) throw Error('mcp_submission_revision_conflict');
  const previous = (await submissionStore().collection.doc(row.id).collection('chatAssets').doc(existingCoverAssetId()).get()).data();
  // Reuse the original intent, never rebase or silently replace its evidence.
  const section = (await readImageGenSnapshot(uid, `submission-${row.id}`)).article.sections.find(section => section.id === permit.sectionId);
  if (!section) throw Error('mcp_submission_anchor_changed');
  const input = previous?.importInput ?? { submissionId: row.id, expectedRevision: revision, requestId: permit.requestId,
    kind: 'illustration' as const, role: 'cover' as const, origin: 'chatgpt-edited' as const, sectionId: section?.id,
    replaceAssetId: permit.parentAssetId, alt: permit.alt, caption: '', credit: 'Illustration: Apropos Magazine / AI' };
  return importSuppliedImage(uid, input, { identity: permit.fileId, mimeType: 'image/png', read: async () => bytes,
    provenance: 'retained-native-edit-owner-exception' }, undefined, permit.id);
}
