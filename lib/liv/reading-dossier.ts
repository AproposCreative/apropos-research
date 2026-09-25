import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from './cms-field-hash';
import type { LivEditorialFields } from './editorial-assessment-contract';
import type { RetrievedSource } from '@/lib/factcheck/source-reader';

export const readingDossierInput = z.object({
  title: z.string().trim().min(5).max(200),
  text: z.string().trim().min(500).max(25000).refine(v => !/[<>\x00-\x08\x0b-\x1f\x7f]/.test(v)),
  attachmentHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export function readingDossierFields(article: Record<string, any>): LivEditorialFields {
  return Object.fromEntries(['title','subtitle','excerpt','seoTitle','seoDescription','ratingReason','intro','content']
    .filter(key => typeof article[key] === 'string').map(key => [key,article[key]])) as LivEditorialFields;
}
export const readingDossierKey = (runId: string, fields: LivEditorialFields) => `${runId}-${cmsFieldHash(fields)}`;

/** Supplied reading notes, NOT independently verified book text or attendance.
 * Bound to exact CMS fields; changed copy cannot inherit this evidence. */
export async function readReadingDossier(runId: string | undefined, fields?: LivEditorialFields): Promise<RetrievedSource[]> {
  if (!runId || !/^(prepare|reserve-editorial)-20\d{2}-\d{2}-\d{2}$/.test(runId) || !fields) return [];
  const db=getAdminDb(); if(!db)throw Error('liv_dossier_store_unavailable');
  const saved=(await db.collection('livReadingDossiers').doc(readingDossierKey(runId,fields)).get()).data();
  if(!saved)return [];
  const input=readingDossierInput.parse(saved.dossier);
  if(saved.runId!==runId || saved.fieldHash!==cmsFieldHash(fields) || saved.dossierHash!==cmsFieldHash(input) ||
    saved.authority!=='cron-authenticated-operator')throw Error('liv_dossier_mismatch');
  return [{id:'editorial-reading-notes',url:'https://ai.aproposmagazine.com/api/liv/operations/sources',
    title:`Redaktionelt leveret læsedossier (ikke uafhængigt verificeret): ${input.title}`,
    text:input.text,contentHash:cmsFieldHash(input),retrievedAt:saved.createdAt,publishedAt:null}];
}
