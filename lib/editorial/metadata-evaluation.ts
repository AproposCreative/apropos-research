import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { readCalibrationCases } from './calibration-cases';
import { findForbiddenPhrases } from '../seo-engine/forbidden-phrases';
import { SEO_TITLE_MAX, SEO_DESCRIPTION_MAX } from '../seo/constants';

export const metadataFields = z.object({ seoTitle: z.string().max(2000), metaDescription: z.string().max(4000) }).strict();
export const metadataCandidate = z.object({ caseId: z.string().regex(/^[a-f0-9]{24}$/), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  proposed: metadataFields }).strict();
export type MetadataCandidate = z.infer<typeof metadataCandidate>;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalize = (text: string) => text.normalize('NFC').replace(/\s+/gu, ' ').toLocaleLowerCase('da');
function containsTerm(text: string, term: string) {
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(normalize(text));
}
const numbers = (text: string) => text.match(/(?<![\p{L}\p{N}])\d+(?:[.,:/-]\d+)*(?![\p{L}\p{N}])/gu) || [];

/** Fixed local source snapshots, not source-verified truth or subjective labels. */
export function readMetadataCases(root = process.cwd()) {
  const manifest = z.object({ version: z.literal('apropos-metadata-regression-v1'),
    kind: z.literal('archive-regression-not-holdout'),
    cases: z.array(z.object({ id: z.string(), primaryTerm: z.string().min(2) }).strict()).length(20),
  }).strict().parse(JSON.parse(readFileSync(path.join(root, 'data/editorial-evals/metadata-cases-v1.json'), 'utf8')));
  if (new Set(manifest.cases.map(row => row.id)).size !== 20) throw Error('metadata_duplicate_case');
  const archive = readCalibrationCases(root);
  return manifest.cases.map(row => {
    const article = archive.find(article => article.id === row.id && article.kind === 'published-reference');
    if (!article) throw Error('metadata_reference_missing');
    const original = metadataFields.parse({ seoTitle: article.seoTitle, metaDescription: article.metaDescription });
    const source = { title: article.title, intro: article.intro, bodyText: article.bodyText };
    // Names are literal anchors in the existing material, not invented facts or ratings.
    if (!containsTerm(`${source.title} ${source.intro} ${source.bodyText}`, row.primaryTerm)) throw Error('metadata_anchor_missing');
    return { caseId: row.id, primaryTerm: row.primaryTerm, original, source,
      sourceHash: digest({ caseId: row.id, primaryTerm: row.primaryTerm, original, source }),
      provenance: { archive: 'data/apropos-style-samples.jsonl', rowId: row.id,
        fetchedAt: typeof article.fetchedAt === 'string' ? article.fetchedAt : null, sourceVerifiedNow: false },
    };
  });
}
export type MetadataCase = ReturnType<typeof readMetadataCases>[number];
type Finding = { field: 'seoTitle' | 'metaDescription'; code: string; detail: string; excess?: number };
function inspect(source: MetadataCase, fields: z.infer<typeof metadataFields>): Finding[] {
  const findings: Finding[] = [], sourceNumbers = new Set(numbers([source.source.title, source.source.intro,
    source.source.bodyText, source.original.seoTitle, source.original.metaDescription].join(' ')));
  for (const field of ['seoTitle', 'metaDescription'] as const) {
    const value = fields[field], max = field === 'seoTitle' ? SEO_TITLE_MAX : SEO_DESCRIPTION_MAX;
    const add = (code: string, detail: string) => findings.push({ field, code, detail });
    if (!value.trim()) add('empty_field', 'Feltet er tomt.');
    if (!containsTerm(value, source.primaryTerm)) add('primary_name_missing', source.primaryTerm);
    if (value.length > max) findings.push({ field, code: 'length_exceeded', detail: `Grænse ${max}`, excess: value.length - max });
    for (const phrase of findForbiddenPhrases(value)) add('forbidden_phrase', phrase);
    if (value.includes('—')) add('em_dash', 'Lang tankestreg strider mod den gældende stemme.');
    if (/\uFFFD|Ã[¦¸¥]|Â\s/u.test(value)) add('damaged_danish_characters', 'Mulig tegnkodningsfejl.');
    if (/<\/?[a-z][^>]*>/iu.test(value)) add('html_in_metadata', 'SEO-feltet skal være tekst.');
    for (const number of new Set(numbers(value))) if (!sourceNumbers.has(number)) add('new_number_requires_evidence', number);
  }
  return findings;
}

/** Conservative regression screening. No paid model, semantic score or publication gate. */
export function compareMetadata(source: MetadataCase, raw: unknown) {
  const candidate = metadataCandidate.parse(raw);
  if (candidate.caseId !== source.caseId || candidate.sourceHash !== source.sourceHash) throw Error('metadata_source_version_conflict');
  const before = inspect(source, source.original), after = inspect(source, candidate.proposed);
  const key = (row: Finding) => `${row.field}:${row.code}:${row.detail}`;
  const baseline = new Map(before.map(row => [key(row), row]));
  const regressions = after.filter(row => !baseline.has(key(row)) || (row.excess || 0) > (baseline.get(key(row))?.excess || 0));
  const changedFields = (['seoTitle', 'metaDescription'] as const).filter(field => candidate.proposed[field] !== source.original[field]);
  return { caseId: source.caseId, sourceHash: source.sourceHash, proposalHash: digest(candidate.proposed),
    primaryTerm: source.primaryTerm, before, after, regressions, changedFields,
    regressionStatus: regressions.length ? 'regression_detected' : 'no_detected_regression',
    sourceVerifiedNow: false, factualAccuracy: 'not_verified', humanQualityScore: null, publicationApproval: false,
    semanticReview: changedFields.map(field => ({ field, before: source.original[field], after: candidate.proposed[field],
      questions: ['Er emnet og artikeltypen stadig tydelige?', 'Er påstande, navne og deres sammenhæng kildebelagt?',
        'Er dansk, stemme og læserværdi bedre uden generisk fyld?'] })),
    note: 'Ingen fund er ikke et faktatjek eller en kvalitetsgevinst. Kendte arkivfejl vises stadig; færre maskinelle fund er ikke en blindtestsejr.',
  };
}

export function compareMetadataSet(sources: MetadataCase[], raw: unknown) {
  const candidates = z.array(metadataCandidate).length(20).parse(raw);
  if (new Set(candidates.map(row => row.caseId)).size !== 20) throw Error('metadata_duplicate_candidate');
  const rows = candidates.map(candidate => {
    const source = sources.find(row => row.caseId === candidate.caseId);
    if (!source) throw Error('metadata_unknown_case');
    return compareMetadata(source, candidate);
  });
  return { version: 'apropos-metadata-regression-v1', totalCases: rows.length,
    changedCases: rows.filter(row => row.changedFields.length).length,
    regressionCases: rows.filter(row => row.regressions.length).length,
    baselineCasesWithFindings: rows.filter(row => row.before.length).length,
    humanScoredCases: 0, paidAiCalls: 0, publicationApproval: false, rows };
}

export const metadataTestInput = z.object({ caseId: z.string().regex(/^[a-f0-9]{24}$/).optional() }).strict();
/** One selected source at a time; never send the full corpus to a small edit. */
export function getMetadataTestCases(raw: unknown) {
  const input = metadataTestInput.parse(raw), cases = readMetadataCases();
  if (input.caseId) {
    const row = cases.find(row => row.caseId === input.caseId);
    if (!row) throw Error('mcp_metadata_case_not_found');
    return { ...row, untrustedContent: true, paidAiCalls: 0, publicationApproval: false,
      note: 'Gemt arkivtekst til regression, ikke ny faktaverificering eller menneskelig kvalitetsvurdering.' };
  }
  return { cases: cases.map(({ source, ...row }) => ({ ...row, title: source.title })), totalCases: cases.length,
    kind: 'archive-regression-not-holdout', humanScoredCases: 0, paidAiCalls: 0, publicationApproval: false,
    next: 'Hent kun den valgte caseId før du skriver en ny kandidat. review_metadata_candidate ændrer ikke CMS.' };
}
export function reviewMetadataCandidate(raw: unknown) {
  const input = metadataCandidate.parse(raw), source = readMetadataCases().find(row => row.caseId === input.caseId);
  if (!source) throw Error('mcp_metadata_case_not_found');
  if (source.sourceHash !== input.sourceHash) throw Error('mcp_metadata_source_version_conflict');
  return { ...compareMetadata(source, input), paidAiCalls: 0, cmsChanged: false };
}
