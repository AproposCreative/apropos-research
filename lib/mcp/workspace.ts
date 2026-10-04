import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { workspacePayloadSchema, WORKSPACE_MAX_BYTES } from '@/lib/writer-workspace';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { sourceUrl } from '@/lib/factcheck/source-reader';
import { assertArticleMarkupSafe } from './markup';

export const editableArticle = z.object({
  title: z.string().max(200), content: z.string().max(200000),
  subtitle: z.string().max(500).optional(), intro: z.string().max(5000).optional(),
  excerpt: z.string().max(2000).optional(), author: z.string().max(200).optional(),
  category: z.string().max(200).optional(), topicsSelected: z.array(z.string().max(100)).max(20).optional(),
  tags: z.array(z.string().max(100)).max(30).optional(),
  rating: z.number().int().min(1).max(6).optional(), ratingReason: z.string().max(1000).optional(),
  articleFormat: z.enum(['article', 'research-review']).optional(),
  subjectType: z.enum(['film','tv-series','music','art','literature','culture']).optional(),
  featuredImage: z.string().url().max(2000).optional(), featuredImageAlt: z.string().max(500).optional(),
  fotoCredit: z.string().max(500).optional(), imageSourceUrls: z.array(z.string().url().max(2000)).max(20).optional(),
  seoTitle: z.string().max(200).optional(), seoDescription: z.string().max(500).optional(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).optional(),
}).strict();
const evidenceUrl = z.string().max(2000).refine(value => {
  try { const url = sourceUrl(value); return ![...url.searchParams.keys()].some(k => /token|secret|signature|key|credential/i.test(k)); }
  catch { return false; }
});
export const researchSchema = z.array(z.object({ url: evidenceUrl, title: z.string().max(300),
  retrievedAt: z.iso.datetime(), publishedAt: z.iso.datetime().nullable(), notes: z.string().max(4000) }).strict()).max(30);
export const draftInput = z.object({ expectedRevision: z.number().int().nonnegative(),
  draftId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/), article: editableArticle,
  notes: z.string().max(40000).optional(), research: researchSchema.optional(),
}).strict();
export const workspaceRef = (uid: string) => { const db = getAdminDb(); if (!db) throw Error('mcp_unavailable'); return db.collection('writerWorkspaces').doc(uid); };

/** Same workspace/revision/history as Writer. Never accepts an owner UID or AI approval. */
export async function saveMcpDraft(uid: string, value: unknown,
  binding?: { itemId: string; cmsHash: string; fields: Record<string, unknown>; article: Record<string, unknown> },
  copyedit?: { id: string; inputHash: string; metadata: Record<string, unknown> }) {
  const input = draftInput.parse(value), db = getAdminDb(); if (!db) throw Error('mcp_unavailable');
  assertArticleMarkupSafe(input.article.content);
  for (const key of ['intro', 'subtitle', 'excerpt'] as const) if (input.article[key]) assertArticleMarkupSafe(input.article[key]!);
  const ref = workspaceRef(uid), inputHash = cmsFieldHash({ ...input, ...(binding ? { bindingHash: binding.cmsHash } : {}) }),
    receipt = ref.collection('mcpSaves').doc(inputHash);
  return db.runTransaction(async tx => {
    const previous = (await tx.get(ref)).data(), old = (await tx.get(receipt)).data();
    const editReceipt = copyedit ? ref.collection('copyedits').doc(copyedit.id) : null;
    const previousEdit = editReceipt ? (await tx.get(editReceipt)).data() : null;
    if (previousEdit) {
      if (previousEdit.inputHash !== copyedit!.inputHash) throw Error('mcp_revision_conflict');
      return { ...previousEdit.result, replay: true, currentRevision: previous?.revision ?? 0 };
    }
    if (old) return { revision: old.revision, replay: true, currentRevision: previous?.revision ?? 0 };
    const sameDraft = previous?.data.currentDraftId === input.draftId;
    const data = workspacePayloadSchema.parse({
      ...(sameDraft ? previous!.data : { messages: [], notes: '', showWizard: false }),
      chatTitle: input.article.title, currentDraftId: input.draftId, showWizard: false,
      articleData: { ...(sameDraft ? previous!.data.articleData : {}), ...input.article,
        ...(input.research ? { mcpResearch: { sources: input.research, verified: false, suppliedBy: 'chatgpt', savedAt: new Date().toISOString() } } : {}) },
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    if (Buffer.byteLength(JSON.stringify(data)) > WORKSPACE_MAX_BYTES) throw Error('mcp_workspace_too_large');
    const revision = input.expectedRevision + 1, updatedAt = new Date().toISOString();
    if ((previous?.revision ?? 0) !== input.expectedRevision) {
      tx.set(ref.collection('conflicts').doc(inputHash), { revision: input.expectedRevision, data, updatedAt, source: 'chatgpt' });
      return { conflict: true, conflictId: inputHash, currentRevision: previous?.revision ?? 0,
        action: 'Nyere arbejde er bevaret. Dit forslag ligger i conflicts; hent begge versioner før sammenfletning.' };
    }
    if (previous) tx.set(ref.collection('history').doc(String(previous.revision)), previous);
    tx.set(ref, { revision, data, updatedAt });
    if (binding) tx.set(ref.collection('mcpBindings').doc(input.draftId), { ...binding, openedAt: updatedAt });
    tx.create(receipt, { revision, inputHash, draftId: input.draftId, source: 'chatgpt', updatedAt, publicationApproval: false });
    const result = { revision, replay: false, publicationApproval: false, savedTo: 'private_writer_workspace', ...copyedit?.metadata };
    if (editReceipt) tx.create(editReceipt, { inputHash: copyedit!.inputHash, result, createdAt: updatedAt });
    return result;
  });
}
