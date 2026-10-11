import { z } from 'zod';
import { listDrafts } from './draft-overview';
import { listEditorialWork } from './work-catalog';
import { articleReadingPreview } from './submission-preview';
import { getCmsArticle, getLivWork, getWorkspace, getWritingBrief } from '@/lib/mcp/editorial';
import { getSubmissionOptions } from './submission-options';
import { readMapping } from '@/lib/webflow-mapping';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';

export const reviewSource = z.enum(['cms', 'liv-checkpoint', 'private-workspace', 'saved-writing']);
export function reviewLink(kind: string, id: string) {
  return kind === 'private-submission' ? `/connect/chatgpt?submission=${encodeURIComponent(id)}` :
    `/connect/chatgpt?review=1&source=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`;
}

/** A view of existing identities, never a migration, new draft or ready grant. */
export async function reviewQueue(uid: string) {
  return withoutPaidAi(async () => {
    const [drafts, history] = await Promise.all([listDrafts(uid, { limit: 10 }, true),
      listEditorialWork(uid, { limit: 50 }).then(value => ({ value, unavailable: false }), () => ({ value: null, unavailable: true }))]);
    const work = history.value;
    return { ...drafts, items: drafts.items.map(row => ({ ...row, href: reviewLink(row.kind, row.idOfVersion) })),
      unfinishedRuns: (work?.items || []).filter(row => row.kind === 'liv-run' && row.hasText !== true && row.stage !== 'publication_receipt'),
      // Archive versions can belong to published articles. Do not put them in the approval queue.
      writingAttempts: (work?.items || []).filter(row => row.kind === 'saved-writing' && row.hasText === true)
        .map(row => ({ id: String(row.id), title: String(row.title), updatedAt: row.updatedAt as string | null,
          href: reviewLink('saved-writing', String(row.id)) })), workCoverage: work?.coverage || null, historyUnavailable: history.unavailable,
      workMatchingInWindow: work?.matchingInWindow || 0, workRowsShown: work?.items.length || 0 };
  });
}

/** Owner-only historical reading. Existing submissions retain their own approval UI. */
export async function reviewSavedArticle(uid: string, source: z.infer<typeof reviewSource>, id: string) {
  return withoutPaidAi(async () => {
    let article: Record<string, unknown>, version: string | number, notice: string;
    if (source === 'cms') {
      const cms = await getCmsArticle(id);
      article = Object.fromEntries(readMapping().entries.map(m => [m.internal, cms.fields[m.webflowSlug]]));
      version = cms.cmsHash;
      notice = cms.lastPublished ? 'Denne artikel har været publiceret. Dette er den gemte CMS-version, ikke en ny artikel i kø.' :
        'Gemt CMS-kladde. Kilder, billeder og publiceringskontroller skal være aktuelle, før den kan godkendes til udgivelse.';
    } else if (source === 'liv-checkpoint') {
      const work = await getLivWork(id) as Record<string, unknown>;
      if (!work.found || !work.articleCheckpoint) throw Error('mcp_review_text_missing');
      article = work.articleCheckpoint as Record<string, unknown>;
      version = String(work.checkpointHash);
      notice = 'Bevaret Liv-tekst fra et tidligere forløb. Gamle kontrolresultater er ikke en ny godkendelse. Kilder, aktualitet og mangler skal gennemgås før udgivelse.';
    } else if (source === 'private-workspace') {
      const { workspace } = await getWorkspace(uid);
      if (!workspace || workspace.data.currentDraftId !== id) throw Error('mcp_review_version_changed');
      article = workspace.data.articleData || {}; version = workspace.revision;
      notice = 'Din gemte Writer-version. Den kan være en redigering af en allerede udgivet artikel; ingen ny artikel oprettes her.';
    } else {
      const saved = await getWritingBrief(id);
      if (!saved.found || !('rawResponse' in saved) || typeof saved.rawResponse !== 'string' || saved.rawResponse.length > 60_000) throw Error('mcp_review_text_missing');
      article = JSON.parse(saved.rawResponse); version = String(saved.rawHash);
      notice = 'Arkiveret skriveforsøg, ikke en ekstra kladde. Flere forsøg kan høre til samme eller en allerede udgivet artikel. Ingen ny kvalitets- eller publiceringsgodkendelse.';
    }
    const options = await getSubmissionOptions();
    const reading = articleReadingPreview({ ...article,
      author: options.authors.find(a => a.id === article.author || a.name === article.author)?.name || article.author,
      category: options.categories.find(c => c.id === article.category || c.name === article.category)?.name || article.category });
    if (!reading.blocks.some(b => b.kind === 'text')) throw Error('mcp_review_text_missing');
    return { reading, source, id, version, notice, contentHash: cmsFieldHash(article), publicationApproval: false,
      readOnly: true, paidAiCalls: 0, checkedAt: new Date().toISOString() };
  });
}
