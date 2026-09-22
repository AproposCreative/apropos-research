import { getAdminDb } from '@/lib/firebase-admin';
import { articleUnits, assessmentSchema } from '@/lib/factcheck/grounded';
import type { RetrievedSource } from '@/lib/factcheck/source-reader';
import type { GeneratedArticle } from './generate-article';
import { cmsFieldHash } from './cms-field-hash';
import { observationKey, observationCheckpoint, observationFail } from './observations';
import { observationInput, observationReferenceSchema, type ObservationReference, type ObservationReceipt } from './observation-contract';
import { livEditorialFieldContext, type LivEditorialFields } from './editorial-assessment-contract';

export type ObservationSource = RetrievedSource & { evidenceKind: 'colleague-self-attestation';
  articleQuote: string; observation: string; witness: string; unitIds: string[] };

export async function readObservationReference(runId: string, article: GeneratedArticle): Promise<ObservationReference | undefined> {
  const db = getAdminDb(); if (!db) return observationFail('unavailable');
  const checkpointHash = cmsFieldHash(article as unknown as Record<string, unknown>);
  const saved = (await db.collection('livObservations').doc(observationKey(runId, checkpointHash)).get()).data();
  if (!saved) return undefined;
  return observationReferenceSchema.parse({ runId, checkpointHash, evidenceHash: saved.evidenceHash });
}

/** Human testimony is not a web page or independent proof of attendance. It is
 * admitted only for the exact attributed quote; two dated public sources remain required. */
export async function readObservationEvidence(value: unknown, articleText: string, fields: LivEditorialFields): Promise<ObservationSource[]> {
  const ref = observationReferenceSchema.parse(value);
  const db = getAdminDb(); if (!db) return observationFail('unavailable');
  const [run, snapshot] = await db.getAll(db.collection('livDailyArticles').doc(ref.runId),
    db.collection('livObservations').doc(observationKey(ref.runId, ref.checkpointHash)));
  const { article, hash } = observationCheckpoint(run.data());
  const saved = snapshot.data();
  if (!saved || hash !== ref.checkpointHash || saved.runId !== ref.runId || saved.checkpointHash !== hash ||
    !Array.isArray(saved.records) || !saved.records.length || saved.records.length > 3 ||
    cmsFieldHash({ runId: ref.runId, checkpointHash: hash, records: saved.records }) !== ref.evidenceHash || saved.evidenceHash !== ref.evidenceHash)
    return observationFail('changed');
  const savedFields = { title: article.title, subtitle: article.subtitle, excerpt: article.excerpt, seoTitle: article.seoTitle,
    seoDescription: article.seoDescription, ratingReason: article.ratingReason, intro: article.intro, content: article.content };
  if (livEditorialFieldContext(articleText, fields).hash !== livEditorialFieldContext(articleText, savedFields).hash) return observationFail('changed');
  const units = articleUnits(articleText);
  return (saved.records as ObservationReceipt[]).map((record, i) => {
    const { userId, witness, confirmedAt, ...input } = record;
    observationInput.parse(input);
    if (!userId || !['Frederik Kragh', 'Casper', 'Milo'].includes(witness) ||
      input.runId !== ref.runId || input.expectedCheckpointHash !== hash || !input.articleQuote.includes(witness) ||
      !Number.isFinite(Date.parse(confirmedAt)) || Date.parse(confirmedAt) > Date.now() + 300000) return observationFail('invalid');
    const unitIds = units.filter(unit => unit.text.includes(input.articleQuote)).map(unit => unit.id);
    if (unitIds.length !== 1) return observationFail('quote_mismatch');
    return { id: `colleague-${i + 1}`, url: `https://ai.aproposmagazine.com/api/liv/observations?runId=${encodeURIComponent(ref.runId)}`,
      title: `Redaktionel egenbekræftelse fra ${witness} (ikke en offentlig webkilde)`,
      text: `${witness} har bekræftet sin egen oplevelse ved ${input.event}, ${input.experiencedOn}:\n${input.observation}`,
      contentHash: cmsFieldHash(record), retrievedAt: new Date().toISOString(), publishedAt: null,
      evidenceKind: 'colleague-self-attestation', witness, articleQuote: input.articleQuote, observation: input.observation, unitIds };
  });
}

export function constrainObservationCitations(raw: unknown, sources: ObservationSource[]): unknown {
  const parsed = assessmentSchema.safeParse(raw);
  if (!parsed.success || !sources.length) return raw;
  return { ...raw as object, units: parsed.data.units.map(unit => ({ ...unit, claims: unit.claims.map(claim => ({ ...claim,
    citations: claim.citations.map(citation => {
      const source = sources.find(row => row.id === citation.sourceId);
      return !source || (source.unitIds.includes(unit.id) && claim.claim === source.articleQuote && citation.quote === source.observation)
        ? citation : { ...citation, sourceId: `out-of-scope:${citation.sourceId}` };
    }),
  })) })) };
}
