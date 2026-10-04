import { z } from 'zod';
import { workspaceRef } from '@/lib/mcp/workspace';
import { draftDiagnostics } from './draft-diagnostics';
import { loadAproposArticleStructure } from './article-structure';
import { loadLivVoice } from '@/lib/liv/voice';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { getCmsArticle } from '@/lib/mcp/editorial';

export const reviewWorkspaceInput = z.object({ draftId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  expectedRevision: z.number().int().nonnegative() }).strict();
export async function reviewWorkspace(uid: string, value: unknown) {
  const input = reviewWorkspaceInput.parse(value), ref = workspaceRef(uid);
  const current = (await ref.get()).data();
  if (!current || current.revision !== input.expectedRevision || current.data.currentDraftId !== input.draftId) throw Error('mcp_revision_conflict');
  const article = current.data.articleData, report = draftDiagnostics(article);
  const [binding, save] = await Promise.all([ref.collection('mcpBindings').doc(input.draftId).get(), ref.collection('cmsSaves').doc(input.draftId).get()]);
  const itemId = binding.data()?.itemId || save.data()?.articleId;
  const cms = itemId ? await getCmsArticle(itemId) : null;
  const structure = loadAproposArticleStructure(), voice = loadLivVoice();
  // Writer/imported drafts do not carry a trusted admission proof. In particular
  // ChatGPT-supplied research or old workspace flags must never certify new text.
  return { ...report, draftId: input.draftId, revision: input.expectedRevision,
    rules: { structureHash: cmsFieldHash({ rules: structure }), livVoice: { version: voice.version, hash: voice.hash },
      writtenUnder: article.voiceVersion || null, note: 'Aktuelle Liv-regler er ikke bevis på hvilke regler en importeret tekst blev skrevet efter.' },
    suppliedResearch: article.mcpResearch || null, researchVerified: false,
    cms: cms ? { itemId: cms.id, cmsHash: cms.cmsHash, isDraft: cms.isDraft, checkedAt: cms.checkedAt,
      workspaceEqualsCms: null, note: 'Separat CMS-version. Denne læsning er ikke en sammenligning eller publiceringsgodkendelse.' } : null,
    nextSteps: [
      ...(report.findings.length ? ['Ret de konkrete fund med preview_copyedit og apply_copyedit.'] : []),
      'Vurdér emne, artikeltype, læserværdi og kilder separat; fravær af maskinelle fund er ikke godkendelse.',
      'Gem den valgte version med save_webflow_draft; læs get_save_status efter timeout.',
      'Kun en version, der er optaget gennem Livs eksisterende kontroller, kan gå videre til preview_publication og personlig bekræftelse.',
    ],
    admission: { status: 'not_granted', reason: 'fresh_existing_backend_checks_required',
      action: 'Klargøring gennem eksisterende Liv-kontroller er nødvendig. MCP starter ikke betalte checks, research eller billeder og ophæver ikke provider-holds.' },
    untrustedContent: true };
}
