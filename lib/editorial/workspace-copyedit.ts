import { z } from 'zod';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { workspaceRef, saveMcpDraft, editableArticle } from '@/lib/mcp/workspace';
import { copyeditPatches, previewCopyedit } from './copyedit';

export const workspaceCopyeditInput = z.object({
  draftId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/), expectedRevision: z.number().int().nonnegative(),
  patches: copyeditPatches,
}).strict();
export const applyWorkspaceCopyeditInput = workspaceCopyeditInput.extend({ previewHash: z.string().regex(/^[a-f0-9]{64}$/) });

export async function previewWorkspaceCopyedit(uid: string, value: unknown) {
  const input = workspaceCopyeditInput.parse(value);
  const current = (await workspaceRef(uid).get()).data();
  if (!current || current.revision !== input.expectedRevision || current.data.currentDraftId !== input.draftId) {
    throw Error('mcp_revision_conflict');
  }
  const result = previewCopyedit(current.data.articleData, input.patches);
  const previewHash = cmsFieldHash({ uid, ...input, beforeHash: result.beforeHash, afterHash: result.afterHash });
  return { ...result, previewHash, draftId: input.draftId, expectedRevision: input.expectedRevision,
    saved: false, estimatedAiCostDkk: 0 };
}

export async function applyWorkspaceCopyedit(uid: string, value: unknown) {
  const { previewHash, ...input } = applyWorkspaceCopyeditInput.parse(value);
  const ref = workspaceRef(uid), receipt = ref.collection('copyedits').doc(previewHash);
  const inputHash = cmsFieldHash(input), old = (await receipt.get()).data();
  if (old) {
    if (old.inputHash !== inputHash) throw Error('mcp_revision_conflict');
    return { ...old.result, replay: true };
  }
  const preview = await previewWorkspaceCopyedit(uid, input);
  if (preview.previewHash !== previewHash) throw Error('mcp_revision_conflict');
  const article = editableArticle.parse(Object.fromEntries(Object.entries(preview.article).filter(([key]) => key in editableArticle.shape)));
  // Receipt and workspace commit atomically: a lost response can be replayed
  // even after the user has continued editing or opened a different article.
  return saveMcpDraft(uid, { draftId: input.draftId, expectedRevision: input.expectedRevision, article }, undefined,
    { id: previewHash, inputHash, metadata: { changedFields: preview.changedFields, mediaPreserved: true,
      publicationApproval: false, requiresFreshChecks: true, previewHash } });
}
