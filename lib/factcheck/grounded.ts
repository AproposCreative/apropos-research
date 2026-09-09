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
      const boundary = remaining.lastIndexOf(' ', end);
      if (boundary > 900) end = boundary + 1;
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

export interface GroundedReport {
  ok: true;
  verificationMethod: 'retrieved-sources';
  articleHash: string;
  checkedAt: string;
  complete: boolean;
  blockers: string[];
  coverage: { expectedUnits: number; checkedUnits: number };
  results: { claim: string; status: string; evidence: string; citations: { sourceId: string; url: string; quote: string }[] }[];
  sources: Omit<RetrievedSource, 'text'>[];
}

const normalize = (text: string) => text.replace(/\s+/gu, ' ').trim();

/** Only server-retrieved text can support a citation. Model URLs and flags are not trusted. */
export function assessGroundedReport(text: string, sources: RetrievedSource[], raw: unknown, now = Date.now()): GroundedReport {
  const units = articleUnits(text);
  const parsed = assessmentSchema.safeParse(raw);
  const blockers: string[] = [];
  const results: GroundedReport['results'] = [];
  const checked = new Set<string>();
  const citedHosts = new Set<string>();
  const sourceMap = new Map(sources.map(source => [source.id, source]));
  if (!parsed.success) blockers.push('Ugyldigt svar fra faktakontrollen.');
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
      for (const citation of claim.citations) {
        const source = sourceMap.get(citation.sourceId);
        if (!source || !source.publishedAt || !normalize(source.text).includes(normalize(citation.quote))) {
          valid = false;
          continue;
        }
        citations.push({ sourceId: source.id, url: source.url, quote: citation.quote });
      }
      const status = claim.status === 'verified' && (!valid || citations.length === 0) ? 'unverifiable' : claim.status;
      if (status !== 'verified') blockers.push(`Manglende eller modstridende belæg i ${row.id}.`);
      if (status === 'verified') citations.forEach(citation => citedHosts.add(new URL(citation.url).hostname.replace(/^www\./, '')));
      results.push({ claim: claim.claim, status, evidence: claim.explanation, citations });
    }
  }
  if (checked.size !== units.length) blockers.push('Ikke hele artikelteksten er kontrolleret.');
  if (!results.length) blockers.push('Ingen dokumenterede faktuelle påstande.');
  if (citedHosts.size < 2) blockers.push('Der kræves belæg fra mindst to kildeværter.');
  return {
    ok: true, verificationMethod: 'retrieved-sources', articleHash: articleFingerprint(text),
    checkedAt: new Date(now).toISOString(), complete: blockers.length === 0,
    blockers: [...new Set(blockers)], coverage: { expectedUnits: units.length, checkedUnits: checked.size },
    results, sources: sources.map(({ text: _text, ...metadata }) => metadata),
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
      publishedAt: z.string(), retrievedAt: z.string() })),
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
    if (!source || !Number.isFinite(Date.parse(source.publishedAt)) || Date.parse(source.publishedAt) > now + 300_000 ||
        !Number.isFinite(Date.parse(source.retrievedAt)) || Date.parse(source.retrievedAt) < now - 900_000 || Date.parse(source.retrievedAt) > now + 300_000) return false;
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    hosts.add(url.hostname.replace(/^www\./, ''));
    return true;
  }));
  return valid && hosts.size >= 2;
}
