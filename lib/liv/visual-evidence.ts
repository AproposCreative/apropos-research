import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { articleUnits, assessmentSchema } from '@/lib/factcheck/grounded';
import type { RetrievedSource } from '@/lib/factcheck/source-reader';
import type { GeneratedArticle } from './generate-article';
import { cmsFieldHash } from './cms-field-hash';
import { livImageArticleHash } from './article-image-hash';
import { livEditorialFieldContext, type LivEditorialFields } from './editorial-assessment-contract';
import { reviewLivEditorialEditMedia } from './editorial-edit-media-review';
import { readLivStoredImage } from './stored-image-reader';

export const livVisualReferenceSchema = z.object({
  runId: z.string().regex(/^prepare-\d{4}-\d{2}-\d{2}$/),
  checkpointHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type LivVisualReference = z.infer<typeof livVisualReferenceSchema>;
export type LivVisualSource = RetrievedSource & {
  evidenceKind: 'verified-image-observation'; receiptHash: string; imageHash: string; unitIds: string[];
};
const fingerprint = (article: GeneratedArticle) => cmsFieldHash(article as unknown as Record<string, unknown>);
const fail = (): never => { throw new Error('liv_visual_evidence_invalid'); };

/** Deliberately closed visual grammar, not a named-entity guesser. All other
 * descriptions still require normal evidence: names, roles, relationships,
 * named places, dates, emotions, intentions and plot events are not pixel facts. */
export function isAnonymousVisibleCaption(text: string): boolean {
  return /^(?:En (?:mand|kvinde|person)|To (?:mænd|kvinder|personer)|En mand og en kvinde) (?:går|står|sidder) (?:side om side )?(?:på en (?:vinterlig )?(?:bygade|gade)|uden for en café|ved et bord|i et rum|på en bænk)(?: med hver sin kaffekop)?\.$/u.test(text);
}

/** Resolve only server-owned, exact final checkpoints and completed immutable
 * operator visual audits. Never accept supplied captions, sources or pass flags.
 * Source text below is explicitly a pixel-observation record, NOT webpage text.
 * It is undated and cannot satisfy the two dated editorial source hosts. */
export async function readLivVisualEvidence(value: unknown, articleText: string, fields: LivEditorialFields): Promise<LivVisualSource[]> {
  const reference = livVisualReferenceSchema.parse(value);
  const db = getAdminDb();
  if (!db) fail();
  const run = db!.collection('livDailyArticles').doc(reference.runId);
  const row = (await run.get()).data();
  const article = row?.articleCheckpoint as GeneratedArticle | undefined;
  if (!article || fingerprint(article) !== reference.checkpointHash || row?.articleCheckpointHash !== livImageArticleHash(article) ||
    article.selectedImage?.visualReview !== 'automated' || article.selectedImage.articleHash !== livImageArticleHash(article) ||
    article.selectedImage.editorialEdit?.runId !== reference.runId) fail();
  const savedFields = { title: article!.title, subtitle: article!.subtitle, excerpt: article!.excerpt,
    seoTitle: article!.seoTitle, seoDescription: article!.seoDescription, ratingReason: article!.ratingReason,
    intro: article!.intro, content: article!.content };
  const context = livEditorialFieldContext(articleText, fields);
  if (livEditorialFieldContext(articleText, savedFields).hash !== context.hash) fail();
  const day = reference.runId.slice('prepare-'.length);
  // This reuses all existing audit/patch/hash/receipt validation, with paid work disabled.
  if (fingerprint(await reviewLivEditorialEditMedia(article!, day, { readOnly: true })) !== reference.checkpointHash) fail();
  const edit = run.collection('editorialEdits').doc(article!.selectedImage!.editorialEdit!.requestId);
  const receipt = (await edit.collection('checks').doc('visual-review').get()).data();
  if (!receipt || receipt.status !== 'complete' || receipt.articleHash !== reference.checkpointHash ||
    !Number.isFinite(Date.parse(receipt.completedAt)) || Date.parse(receipt.completedAt) > Date.now() + 300_000) fail();
  const receiptHash = cmsFieldHash(receipt!);
  const media = article!.preparedMedia;
  if (media?.length !== 3 || new Set(media.map(image => image.role)).size !== 3 ||
    !['hero', 'body-1', 'body-2'].every(role => media.some(image => image.role === role)) ||
    new Set(media.map(image => image.contentHash)).size !== 3) fail();
  const $ = load(article!.content);
  const contentStart = context.fields.find(field => field.name === 'content')!.start;
  let offset = 0;
  const units = articleUnits(articleText).map(unit => { const start = offset; offset += unit.text.length; return { ...unit, start, end: offset }; });
  const sources: LivVisualSource[] = [];
  for (const image of media!) {
    const bytes = await readLivStoredImage(image.url);
    if (createHash('sha256').update(bytes).digest('hex') !== image.contentHash || bytes.length !== image.bytes) fail();
    if (image.role === 'hero' || image.kind !== 'photography') continue;
    const figure = $(`figure[data-liv-media="${image.role}"]`);
    const caption = figure.find('figcaption');
    const img = figure.find('img');
    const credit = /^(?:foto|illustration|kilde|credit)\s*:|^©/i.test(image.credit) ? image.credit : `Foto: ${image.credit}`;
    if (figure.length !== 1 || caption.length !== 1 || img.length !== 1 || img.attr('src') !== image.url ||
      img.attr('alt') !== image.alt || caption.text() !== `${image.caption} ${credit}`) fail();
    const fragments = [...article!.content.matchAll(/<figure\b[^>]*>[\s\S]*?<\/figure>/g)]
      .filter(match => load(match[0])(`figure[data-liv-media="${image.role}"]`).length === 1);
    if (fragments.length !== 1) fail();
    const fragment = fragments[0];
    const figureStart = contentStart + fragment.index!, figureEnd = figureStart + fragment[0].length;
    for (const field of ['alt', 'caption'] as const) {
      const text = image[field];
      if (!isAnonymousVisibleCaption(text)) continue;
      const fieldFragment = fragment[0].match(field === 'alt' ? /<img\b[^>]*>/ : /<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/);
      if (!fieldFragment) fail();
      // Identical words elsewhere in prose cannot borrow a figure's evidence.
      const occurrences = [...articleText.matchAll(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))];
      if (occurrences.some(match => match.index! < figureStart || match.index! + text.length > figureEnd)) continue;
      const literal = fieldFragment![0].indexOf(text);
      if (literal < 0 || fieldFragment![0].indexOf(text, literal + 1) !== -1) continue;
      const start = figureStart + fieldFragment!.index! + literal, end = start + text.length;
      const unitIds = units.filter(unit => start >= unit.start && end <= unit.end && unit.text.includes(text)).map(unit => unit.id);
      if (unitIds.length !== 1) continue; // Cross-unit/escaped ambiguity remains normal text verification.
      sources.push({ id: `visual-${image.role}-${field}`, url: image.url, title: `Serververificeret anonym billedobservation (${field}, ikke websidetekst)`,
      text, contentHash: cmsFieldHash({ reference, receiptHash, imageHash: image.contentHash, field, text }),
      retrievedAt: new Date().toISOString(), publishedAt: null, evidenceKind: 'verified-image-observation',
      receiptHash, imageHash: image.contentHash, unitIds });
    }
  }
  return sources;
}

/** A visual record supports ONLY its whole literal caption in its bound figure
 * unit, never a name/event elsewhere or an inferred fragment. Raw paid output
 * remains untouched in the assessment archive; invalid citations fail normally. */
export function constrainLivVisualCitations(raw: unknown, sources: LivVisualSource[]): unknown {
  const parsed = assessmentSchema.safeParse(raw);
  if (!parsed.success || !sources.length) return raw;
  const normalize = (text: string) => text.trim().replace(/\.$/, '');
  return { ...raw as object, units: parsed.data.units.map(unit => ({ ...unit, claims: unit.claims.map(claim => ({ ...claim,
    citations: claim.citations.map(citation => {
      const source = sources.find(source => source.id === citation.sourceId);
      const allowed = !source || (source.unitIds.includes(unit.id) && normalize(claim.claim) === normalize(source.text) && citation.quote === source.text);
      // Keep unsupported extra citations blocking, just like unsupported text
      // citations. Never silently discard one to rescue an otherwise valid claim.
      return allowed ? citation : { ...citation, sourceId: `out-of-scope:${citation.sourceId}` };
    }),
  })) })) };
}
