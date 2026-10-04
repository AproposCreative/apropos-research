import { load } from 'cheerio';
import { parseLivArticleOutput } from '@/lib/liv/article-output';
import { isLivArticleFormat } from '@/lib/liv/review-format';

const finishReasons = ['stop', 'length', 'tool_calls', 'content_filter', 'function_call'];
export const SAVED_WRITING_NOTE = 'Gemte svar er ikke færdige artikler. Schema og afslutningssignal er ikke faktatjek, kvalitetskontrol eller publiceringstilladelse. null betyder ukendt.';
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const boundedLabel = (value: unknown, max: number) => typeof value === 'string'
  ? value.slice(0, max).replace(/\b(?:sk-|re_|ghp_|gho_)[a-z\d_-]+/gi, '[skjult]')
    .replace(/\bBearer\s+\S+/gi, '[skjult]').trim() : '';

export function hasArticleText(content: unknown): boolean | null {
  if (content == null) return false;
  if (typeof content !== 'string' || content.length > 40000) return null;
  if (!content.trim()) return false;
  const $ = load(content);
  $('script, style, template, noscript').remove();
  return !!$.root().text().trim();
}

/** Projection of retained output, not a quality check, paid retry or ready grant. */
export function savedWritingSummary(row: Record<string, unknown>) {
  const responseStored = typeof row.rawResponse === 'string';
  const raw = responseStored ? row.rawResponse as string : '';
  const hasRawResponse = !!raw.trim();
  let output: Record<string, unknown> | null = null;
  if (hasRawResponse && raw.length <= 60000) {
    try { output = record(JSON.parse(raw)); } catch { /* Keep legacy/invalid raw text, but do not infer an article. */ }
  }
  const hasText = output ? hasArticleText(output.content) : hasRawResponse ? null : false;
  const providerOutputStatus = output?.status === 'ready' || output?.status === 'insufficient_evidence' ? output.status : null;
  const missingEvidence = [...new Set([row.missingEvidence, output?.missingEvidence].flatMap(value =>
    Array.isArray(value) ? value.slice(0, 6).map(v => boundedLabel(v, 500)).filter(Boolean) : []))].slice(0, 6);
  const finishReason = typeof row.finishReason === 'string' && finishReasons.includes(row.finishReason) ? row.finishReason : null;
  const refusalRecorded = typeof row.refusal === 'string' && !!row.refusal.trim();
  const incomplete = refusalRecorded || finishReason === 'content_filter' ||
    row.finishReason != null && row.finishReason !== 'stop';
  let articleSchemaValid: boolean | null = null;
  if (output) {
    articleSchemaValid = false;
    const format = row.articleFormat === undefined ? 'article' : row.articleFormat;
    if (isLivArticleFormat(format)) {
      try { parseLivArticleOutput(raw, format); articleSchemaValid = true; } catch { /* Not structurally reusable. */ }
    }
  }
  const evidenceBlocked = row.status === 'insufficient_evidence' || providerOutputStatus === 'insufficient_evidence' || missingEvidence.length > 0;
  const stage = evidenceBlocked ? 'evidence_blocked' : !responseStored ? 'brief_only' : !hasRawResponse ? 'empty_output' :
    incomplete ? 'incomplete_output' : !output ? 'unparsed_output' : articleSchemaValid && hasText ? 'written_unverified' : 'incomplete_output';
  const blocker = {
    evidence_blocked: 'article_evidence_insufficient', brief_only: 'writing_response_not_recorded',
    empty_output: 'writing_response_empty', incomplete_output: 'writing_output_incomplete',
    unparsed_output: 'writing_output_not_parsed', written_unverified: null,
  }[stage];
  const fallbackTitle = stage === 'brief_only' ? 'Gemt researchbrief · intet artikelsvar registreret' :
    stage === 'evidence_blocked' ? 'Stoppet skriveforsøg · utilstrækkeligt belæg' :
      stage === 'written_unverified' ? 'Gemt artikeltekst · ikke godkendt' : 'Gemt skriveforsøg · svar skal kontrolleres';
  return { title: boundedLabel(output?.title, 300) || fallbackTitle, stage, hasText, hasRawResponse, responseStored,
    providerOutputStatus, finishReason, refusalRecorded, articleSchemaValid, missingEvidence,
    blockers: blocker ? [blocker] : [], publicationApproval: false };
}
