import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { RetrievedSource } from './source-reader';

export const groundedInput = z.object({
  articleText: z.string().trim().min(20).max(40_000),
  sourceUrls: z.array(z.string().url().max(2000)).min(1).max(8),
});

export function articleFingerprint(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}

/** No truncation: every character belongs to a review unit. */
export function articleUnits(text: string): { id: string; text: string }[] {
  const units: { id: string; text: string }[] = [];
  let remaining = text.trim();
  while (remaining.length) {
    let end = Math.min(1800, remaining.length);
    if (end < remaining.length) {
      // Keep the premise and qualification together. Only fall back to spaces
      // for unusually long paragraphs/sentences; never omit any characters.
      const paragraph = remaining.lastIndexOf('\n', end - 1);
      const sentences = [...remaining.slice(0, end).matchAll(/[.!?](?:<\/p>)?\s+/gu)];
      const sentence = sentences.at(-1);
      const sentenceEnd = sentence ? sentence.index! + sentence[0].length : 0;
      const space = remaining.lastIndexOf(' ', end - 1);
      if (paragraph >= 900) end = paragraph + 1;
      else if (sentenceEnd >= 900) end = sentenceEnd;
      else if (space >= 900) end = space + 1;
    }
    units.push({ id: `u${units.length + 1}`, text: remaining.slice(0, end) });
    remaining = remaining.slice(end);
  }
  return units;
}

export const assessmentSchema = z.object({
  units: z.array(z.object({
    id: z.string(),
    opinionOnly: z.boolean(),
    claims: z.array(z.object({
      claim: z.string().min(5).max(1800),
      status: z.enum(['verified', 'disputed', 'unverifiable']),
      explanation: z.string().min(1).max(1000),
      citations: z.array(z.object({ sourceId: z.string(), quote: z.string().min(20).max(600) })).max(4),
    })).max(30),
  })).min(1).max(50),
});

// Constrain provider output to the same shape the server validates. JSON mode
// alone guarantees syntax, not the required unit/claim/citation structure.
const { $schema: _schemaVersion, ...assessmentJsonSchema } = z.toJSONSchema(assessmentSchema);
export const groundedResponseFormat = {
  type: 'json_schema' as const,
  json_schema: { name: 'grounded_factcheck_v1', strict: true, schema: assessmentJsonSchema },
};

export const GROUNDED_POLICY_VERSION = 'retrieved-sources-v2-undated-concrete';

export interface GroundedReport {
  /** Optional for successful reports produced under the older, stricter policy. */
  policyVersion?: string;
  ok: true;
  verificationMethod: 'retrieved-sources';
  articleHash: string;
  checkedAt: string;
  complete: boolean;
  blockers: string[];
  coverage: { expectedUnits: number; checkedUnits: number };
  results: { claim: string; status: string; evidence: string; validationErrors?: string[]; citations: { sourceId: string; url: string; quote: string }[] }[];
  sources: Omit<RetrievedSource, 'text'>[];
  diagnostic?: { code: 'insufficient_dated_sources' | 'model_response_incomplete' | 'model_response_invalid_json' | 'model_response_invalid_schema' };
}

const normalize = (text: string) => text.replace(/\s+/gu, ' ').trim();

function freshSourceMetadata(source: { contentHash?: string; retrievedAt?: string; publishedAt?: string | null }, now: number) {
  const retrievedAt = Date.parse(source.retrievedAt || '');
  return Number.isFinite(now) && /^[a-f0-9]{64}$/.test(source.contentHash || '') &&
    Number.isFinite(retrievedAt) && retrievedAt >= now - 900_000 && retrievedAt <= now + 300_000 &&
    (source.publishedAt === null || (typeof source.publishedAt === 'string' &&
      Number.isFinite(Date.parse(source.publishedAt)) && Date.parse(source.publishedAt) <= now + 300_000));
}

/** Only server-retrieved text can support a citation. Model URLs and flags are not trusted. */
export function assessGroundedReport(text: string, sources: RetrievedSource[], raw: unknown, now = Date.now(),
  failure?: { code: NonNullable<GroundedReport['diagnostic']>['code']; message: string }): GroundedReport {
  const units = articleUnits(text);
  const parsed = assessmentSchema.safeParse(raw);
  const blockers: string[] = [];
  const results: GroundedReport['results'] = [];
  const checked = new Set<string>();
  const citedHosts = new Set<string>();
  const sourceMap = new Map(sources.map(source => [source.id, source]));
  if (failure) blockers.push(failure.message);
  else if (!parsed.success) blockers.push('Ugyldigt svar fra faktakontrollen.');
  for (const row of parsed.success ? parsed.data.units : []) {
    const unit = units.find(candidate => candidate.id === row.id);
    if (!unit || checked.has(row.id)) {
      blockers.push('Ukendt eller gentaget tekstafsnit i kontrollen.');
      continue;
    }
    checked.add(row.id);
    if ((row.opinionOnly && row.claims.length > 0) || (!row.opinionOnly && row.claims.length === 0)) {
      blockers.push(`Ufuldstændig påstandsliste i ${row.id}.`);
    }
    for (const claim of row.claims) {
      const citations: GroundedReport['results'][number]['citations'] = [];
      let valid = normalize(unit.text).includes(normalize(claim.claim));
      const validationErrors: string[] = valid ? [] : ['claim_not_in_unit'];
      for (const citation of claim.citations) {
        const source = sourceMap.get(citation.sourceId);
        if (!source || !freshSourceMetadata(source, now) || !normalize(source.text).includes(normalize(citation.quote))) {
          valid = false;
          validationErrors.push(!source ? 'unknown_source' : !freshSourceMetadata(source, now) ? 'invalid_source_metadata' : 'quote_not_in_source');
          continue;
        }
        citations.push({ sourceId: source.id, url: source.url, quote: citation.quote });
      }
      const status = claim.status === 'verified' && (!valid || citations.length === 0) ? 'unverifiable' : claim.status;
      if (status !== 'verified') blockers.push(`Manglende eller modstridende belæg i ${row.id}.`);
      if (status === 'verified') citations.forEach(citation => {
        // Undated evidence may prove a fact, never the two-dated-host minimum.
        if (sourceMap.get(citation.sourceId)?.publishedAt) citedHosts.add(new URL(citation.url).hostname.replace(/^www\./, ''));
      });
      results.push({ claim: claim.claim, status, evidence: claim.explanation, citations,
        ...(validationErrors.length ? { validationErrors } : {}) });
    }
  }
  if (checked.size !== units.length) blockers.push('Ikke hele artikelteksten er kontrolleret.');
  if (!results.length) blockers.push('Ingen dokumenterede faktuelle påstande.');
  if (citedHosts.size < 2) blockers.push('Der kræves belæg fra mindst to kildeværter.');
  return {
    ok: true, verificationMethod: 'retrieved-sources', policyVersion: GROUNDED_POLICY_VERSION, articleHash: articleFingerprint(text),
    checkedAt: new Date(now).toISOString(), complete: blockers.length === 0,
    blockers: [...new Set(blockers)], coverage: { expectedUnits: units.length, checkedUnits: checked.size },
    results, sources: sources.map(({ text: _text, ...metadata }) => metadata),
    ...(!parsed.success || failure ? { diagnostic: { code: failure?.code || 'model_response_invalid_schema' as const } } : {}),
  };
}

/** The report is valid only for this exact text and this recent verification run. */
export function isCompleteGroundedReport(value: unknown, text: string, now = Date.now()): boolean {
  const schema = z.object({
    ok: z.literal(true), verificationMethod: z.literal('retrieved-sources'), complete: z.literal(true),
    articleHash: z.string(), checkedAt: z.string(), blockers: z.array(z.string()).length(0),
    coverage: z.object({ expectedUnits: z.number().int().positive(), checkedUnits: z.number().int().positive() }),
    results: z.array(z.object({ status: z.literal('verified'), citations: z.array(z.object({
      sourceId: z.string(), url: z.string().url(), quote: z.string().min(20),
    })).min(1) })).min(1),
    sources: z.array(z.object({ id: z.string(), url: z.string().url(), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
      publishedAt: z.string().nullable(), retrievedAt: z.string() })),
  });
  const parsed = schema.safeParse(value);
  if (!parsed.success || !Number.isFinite(now)) return false;
  const report = parsed.data;
  if (report.articleHash !== articleFingerprint(text)) return false;
  const checkedAt = Date.parse(report.checkedAt);
  if (!Number.isFinite(checkedAt) || checkedAt > now + 300_000 || checkedAt < now - 900_000) return false;
  const count = articleUnits(text).length;
  if (report.coverage?.expectedUnits !== count || report.coverage.checkedUnits !== count) return false;
  const hosts = new Set<string>();
  const valid = report.results.every(result => result.citations.every(citation => {
    const source = report.sources.find(source => source.id === citation.sourceId && source.url === citation.url);
    if (!source || !freshSourceMetadata(source, now)) return false;
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (source.publishedAt !== null) hosts.add(url.hostname.replace(/^www\./, ''));
    return true;
  }));
  return valid && hosts.size >= 2;
}
