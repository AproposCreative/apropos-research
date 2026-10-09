import { z } from 'zod';
import { inspectImageGenPressSources } from '@/lib/image-gen/press';
import { readImageGenSnapshot } from '@/lib/image-gen/snapshot';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { readSubmission, submissionStore } from './submissions';
import { submissionId } from './submission-contract';
import { coverSelectionPolicy } from './cover-selection-policy';

export const submissionMediaInput = z.object({ submissionId, expectedRevision: z.number().int().positive(),
  sourceUrls: z.array(z.string().url().max(2000)).max(4).optional(), refresh: z.boolean().default(false) }).strict();

/** Bounded source-page extraction. It neither buys research nor certifies image relevance/rights. */
export async function findSubmissionImages(uid: string, raw: unknown) {
  const input = submissionMediaInput.parse(raw), row = await readSubmission(uid, input.submissionId);
  if (row.revision !== input.expectedRevision) throw Error('mcp_submission_revision_conflict');
  const sources = input.sourceUrls ?? [...new Set([...(row.article.imageSourceUrls || []), ...row.research.map(s => s.url)])].slice(0, 4);
  const key = cmsFieldHash({ version: row.contentHash, sources });
  const cache = submissionStore().collection.doc(row.id).collection('pressSearches').doc(key);
  const old = (await cache.get()).data();
  // Source extraction can be reused, but current editorial guidance must not be stale.
  if (old && !input.refresh) return { ...old, reused: true, coverSelectionPolicy: coverSelectionPolicy() };
  const found = await inspectImageGenPressSources(sources);
  const result = { ...found, sources, contentHash: row.contentHash, checkedAt: new Date().toISOString(),
    publicationApproval: false, paidAiCalls: 0, instruction: 'Kontrollér værk/sæson og motiv. Ukendt rettighedsstatus er ikke godkendt. Opfind ikke manglende kredit.' };
  await cache.set(result);
  return { ...result, reused: false, coverSelectionPolicy: coverSelectionPolicy() };
}

export async function submissionMediaContext(uid: string, id: string) {
  const row = await readSubmission(uid, id);
  const snapshot = await readImageGenSnapshot(uid, `submission-${id}`);
  return { ...snapshot, revision: row.revision, contentHash: row.contentHash,
    coverSelectionPolicy: coverSelectionPolicy(),
    mediaMode: row.choices.media, style: row.choices.style,
    instruction: 'Motiver bindes til sectionId og et ordret excerpt. Film/serier må ikke bruge genererede stills.' };
}
