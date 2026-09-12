/**
 * Liv Brandt — sikkerhedsporte før auto-publish.
 *
 * Separate logical gates remain independently blocking. Strict Liv checks use
 * one combined model assessment for facts and editorial feedback:
 *  1. Moderation (plagiat-/lighedstjek + min. ordtælling)
 *  2. Factcheck (hentede kilder og belæg for hele artikelversionen)
 *  3. TOV (minor stylistic tips are advisory; explicit material issues block)
 *
 * Hver gate returneres som `{ name, pass, detail }` og gemmes i Firestore
 * for transparens.
 */

import type { GateResult } from '@/lib/liv/daily-history-store';
import { internalApiHeaders } from '@/lib/api/internal-auth';
import { logger } from '@/lib/logger';
import { checkSourceSimilarity } from '@/lib/liv/source-similarity';
import { articleFingerprint, articleUnits, isCompleteGroundedReport, type GroundedReport } from '@/lib/factcheck/grounded';
import { z } from 'zod';
import { isLivAuthor, loadLivVoice } from '@/lib/liv/voice';
import { editorialVerdictPasses, readLivEditorialEvidence, livEditorialFieldContext, type LivEditorialFields } from '@/lib/liv/editorial-assessment-contract';
import { livCostHeaders } from '@/lib/liv/cost-context';

export interface SafetyGatesInput {
  baseUrl: string;
  title: string;
  content: string;
  intro?: string;
  authorName?: string;
  /**
   * Råt uddrag fra inspirationskilden. Bruges af source-similarity-gaten
   * til at fange paraphrasing/strukturel kopiering — ikke kun verbatim.
   * Hvis ikke sat, springer vi gaten over (fx ved manuel preview).
   */
  sourceExcerpt?: string;
  sourceUrls?: string[];
  /** Other publishable text, including subtitle, excerpt and SEO fields. */
  additionalTexts?: string[];
  /** Exact named CMS fields; labels never alter the existing checked text. */
  editorialFields?: LivEditorialFields;
  /** Auto-publish må kun ske, når alle relevante gates faktisk er kørt. */
  requireCompleteVerification?: boolean;
  /** Bound infrastructure checks so preparation jobs cannot outlive the worker. */
  timeoutMs?: number;
  /** Server-saved report only; reusable solely for the exact text within its freshness window. */
  priorFactcheck?: GroundedReport;
}

export interface SafetyGatesOutput {
  pass: boolean;
  failedGate?: string;
  results: GateResult[];
  /** Mindst én gate blev sprunget over (ikke egentlig verificeret). */
  anyGateSkipped?: boolean;
}

interface ModerationResponse {
  data?: {
    metrics?: { plagiarismRisk?: 'low' | 'medium' | 'high'; wordCount?: number; maxSim?: number };
    nearest?: { title?: string; url?: string };
  };
}

interface FactcheckResponse {
  ok?: boolean;
  verificationMethod?: string;
  blockers?: string[];
  editorialReview?: unknown;
  fieldContextHash?: string;
  results?: Array<{
    claim?: string;
    status?: 'verified' | 'disputed' | 'unverifiable' | string;
    confidence?: number;
  }>;
}

interface TovResponse {
  data?: { tips?: string };
}

// Retention validates structure and article identity, not truth or approval.
// Strip unknown fields so upstream extras (including full source text) are not archived.
const diagnosticReportSchema = z.object({
  ok: z.literal(true), verificationMethod: z.literal('retrieved-sources'),
  articleHash: z.string().regex(/^[a-f0-9]{64}$/), checkedAt: z.string().datetime(), complete: z.boolean(),
  fieldContextHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  blockers: z.array(z.string()),
  coverage: z.object({ expectedUnits: z.number().int().positive(), checkedUnits: z.number().int().nonnegative() }),
  results: z.array(z.object({
    claim: z.string(), status: z.string(), evidence: z.string(), validationErrors: z.array(z.string()).optional(),
    citations: z.array(z.object({ sourceId: z.string(), url: z.string().url(), quote: z.string() })),
  })),
  sources: z.array(z.object({
    id: z.string(), url: z.string().url(), title: z.string(), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    retrievedAt: z.string().datetime(), publishedAt: z.string().nullable(),
  })),
  diagnostic: z.object({ code: z.enum(['insufficient_dated_sources', 'model_response_incomplete',
    'model_response_invalid_json', 'model_response_invalid_schema']) }).optional(),
});

function diagnosticReport(value: unknown, text: string): GroundedReport | undefined {
  const parsed = diagnosticReportSchema.safeParse(value);
  if (!parsed.success || parsed.data.articleHash !== articleFingerprint(text)) return undefined;
  return { ...parsed.data, sources: parsed.data.sources.map(source => ({ ...source, publishedAt: source.publishedAt ?? null })) };
}

/** Reuse a real failed check, never turn it into approval. New sources, new
 * text, partial coverage, infrastructure failures and stale checks need work. */
function reusableFailedReport(value: unknown, text: string, sourceUrls: string[]): GroundedReport | undefined {
  const report = diagnosticReport(value, text);
  if (!report || report.complete || report.diagnostic || !report.results.some(result => result.status !== 'verified') ||
      report.coverage.expectedUnits !== articleUnits(text).length ||
      report.coverage.checkedUnits !== report.coverage.expectedUnits) return undefined;
  const age = Date.now() - Date.parse(report.checkedAt);
  if (age < 0 || age > 900_000) return undefined;
  const expected = [...new Set(sourceUrls)].sort();
  const checked = [...new Set(report.sources.map(source => source.url))].sort();
  if (expected.length < 2 || JSON.stringify(expected) !== JSON.stringify(checked)) return undefined;
  return report;
}

async function postJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: internalApiHeaders(livCostHeaders(new URL(url).pathname)),
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (e) {
    logger.warn('[liv/safety-gates] fetch failed', { url, err: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export async function runSafetyGates(input: SafetyGatesInput): Promise<SafetyGatesOutput> {
  const {
    baseUrl,
    title,
    content,
    intro,
    authorName = 'Liv Brandt',
    sourceExcerpt,
    sourceUrls = [],
    additionalTexts = [],
    requireCompleteVerification = false,
    timeoutMs = 115_000,
  } = input;
  const results: GateResult[] = [];
  let anyGateSkipped = false;
  const fullText = [intro, content].filter(Boolean).join('\n\n');
  const factcheckText = [title, ...additionalTexts, intro, content].filter(Boolean).join('\n\n');
  const consolidated = requireCompleteVerification && isLivAuthor(authorName);
  const fieldContext = consolidated && input.editorialFields !== undefined
    ? livEditorialFieldContext(factcheckText, input.editorialFields) : undefined;
  const voiceHash = consolidated ? loadLivVoice().hash : '';

  // --- Gate 0: Source similarity (paraphrasing/strukturel kopiering af kilden) ---
  // Køres først fordi det er det mest direkte plagiat-signal når Liv har
  // arbejdet med en konkret inspirationskilde.
  if (sourceExcerpt && sourceExcerpt.trim().length >= 80) {
    try {
      const sim = await checkSourceSimilarity({
        generated: fullText,
        source: sourceExcerpt,
      });
      if (!sim.complete) {
        results.push({ name: 'source-similarity', pass: false, skipped: true,
          detail: 'Kildelighedskontrollen kunne ikke gennemføres. Det er ikke en konstatering af plagiat.' });
        return { pass: false, failedGate: 'source-similarity', anyGateSkipped: true, results };
      }
      if (!sim.pass) {
        const detail = `Kilde-lighed for høj — ${sim.reason}. Scores: emb=${sim.scores.embeddingSim.toFixed(3)}, ngram=${sim.scores.ngramJaccard.toFixed(3)}, opening=${sim.scores.openingSim.toFixed(3)}.`;
        results.push({ name: 'source-similarity', pass: false, detail });
        return { pass: false, failedGate: 'source-similarity', results };
      }
      results.push({
        name: 'source-similarity',
        pass: true,
        skipped: !sim.complete,
        detail: `emb=${sim.scores.embeddingSim.toFixed(3)}, ngram=${sim.scores.ngramJaccard.toFixed(3)}, opening=${sim.scores.openingSim.toFixed(3)}`,
      });
    } catch (e) {
      // Ved fejl i embedding-API'et tillader vi publish, men logger advarsel.
      // Lexical-checks er allerede billige, så det er sjældent vi havner her.
      logger.warn('[liv/safety-gates] source-similarity check threw — skipping gate', {
        err: e instanceof Error ? e.message : String(e),
      });
      anyGateSkipped = true;
      results.push({
        name: 'source-similarity',
        pass: true,
        skipped: true,
        detail: 'Gate sprunget over pga. fejl i similarity-tjek',
      });
    }
  } else {
    anyGateSkipped = true;
    results.push({
      name: 'source-similarity',
      pass: true,
      skipped: true,
      detail: 'Ingen sourceExcerpt — gate sprunget over',
    });
  }

  // --- Gate 1: Moderation ---
  const modUrl = new URL('/api/moderation/check', baseUrl).toString();
  const mod = await postJson<ModerationResponse>(modUrl, { title, content: fullText }, timeoutMs);

  if (!mod) {
    const r: GateResult = { name: 'moderation', pass: false, detail: 'API svarede ikke' };
    results.push(r);
    return { pass: false, failedGate: 'moderation', results };
  }

  const metrics = mod.data?.metrics;
  const wordCount = typeof metrics?.wordCount === 'number' ? metrics.wordCount : 0;
  const plagiarism = metrics?.plagiarismRisk || 'low';

  if (plagiarism === 'high') {
    results.push({
      name: 'moderation',
      pass: false,
      detail: `plagiarism=high (maxSim=${metrics?.maxSim?.toFixed(3) || '?'}, nearest=${mod.data?.nearest?.title || 'n/a'})`,
    });
    return { pass: false, failedGate: 'moderation', results };
  }
  if (wordCount < 500) {
    results.push({
      name: 'moderation',
      pass: false,
      detail: `wordCount=${wordCount} < 500`,
    });
    return { pass: false, failedGate: 'moderation', results };
  }
  results.push({
    name: 'moderation',
    pass: true,
    detail: `wordCount=${wordCount}, plagiarism=${plagiarism}, maxSim=${metrics?.maxSim?.toFixed(3) || '?'}`,
  });

  // --- Gate 2: Factcheck ---
  const fcUrl = new URL('/api/factcheck', baseUrl).toString();
  const priorEditorial = readLivEditorialEvidence((input.priorFactcheck as FactcheckResponse | undefined)?.editorialReview, factcheckText, voiceHash);
  const sameSourceUrls = JSON.stringify([...new Set(sourceUrls)].sort()) ===
    JSON.stringify([...new Set(input.priorFactcheck?.sources?.map(source => source.url) || [])].sort());
  const sameFieldContext = !fieldContext || (input.priorFactcheck as FactcheckResponse | undefined)?.fieldContextHash === fieldContext.hash;
  let fc: FactcheckResponse | null = sameFieldContext
    ? isCompleteGroundedReport(input.priorFactcheck, factcheckText) && (!consolidated || (priorEditorial && sameSourceUrls))
      ? input.priorFactcheck! : reusableFailedReport(input.priorFactcheck, factcheckText, sourceUrls) || null
    : null;
  let fcHttpStatus: number | null = null;
  if (!fc) try {
    const res = await fetch(fcUrl, {
      method: 'POST',
      headers: internalApiHeaders(livCostHeaders('/api/factcheck')),
      body: JSON.stringify({ articleText: factcheckText, sourceUrls, ...(consolidated ? { editorialReview: 'liv-v1',
        ...(fieldContext ? { editorialFields: input.editorialFields } : {}) } : {}) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    fcHttpStatus = res.status;
    if (!res.ok) {
      logger.warn('[liv/safety-gates] factcheck HTTP ikke-OK', {
        status: res.status,
        fcUrl,
      });
      fc = null;
    } else {
      fc = (await res.json()) as FactcheckResponse;
    }
  } catch (e) {
    logger.warn('[liv/safety-gates] factcheck fetch fejlede', {
      fcUrl,
      err: e instanceof Error ? e.message : String(e),
    });
    fc = null;
  }

  // A contextual request cannot consume an old-method response, even on the
  // same text. This invalidates reuse, never edits or clears a failed verdict.
  if (fieldContext && fc?.fieldContextHash !== fieldContext.hash) fc = null;

  const fcUsable = fc != null && (fc.ok === true || (Array.isArray(fc.results) && fc.ok !== false));

  if (!fcUsable) {
    // Infrastruktur / tomt svar — blokér ikke publish, men marker som sprunget over.
    anyGateSkipped = true;
    const statusHint =
      fcHttpStatus != null ? `HTTP ${fcHttpStatus}` : 'ingen HTTP-svar (netværksfejl eller forkert baseUrl)';
    results.push({
      name: 'factcheck',
      pass: true,
      skipped: true,
      detail: `${statusHint}. Factcheck blev ikke kørt — ikke et reelt faktatjek.`,
    });
  } else {
    const checked = Array.isArray(fc.results) ? fc.results.filter(r => r && typeof r === 'object') : [];
    const sourceGrounded = isCompleteGroundedReport(fc, factcheckText);
    const diagnosticEvidence = sourceGrounded ? undefined : diagnosticReport(fc, factcheckText);
    if (!sourceGrounded) anyGateSkipped = true;
    const disputed = checked.filter((r) => r.status === 'disputed');
    if (disputed.length > 0) {
      results.push({
        name: 'factcheck',
        pass: false,
        ...(diagnosticEvidence ? { diagnosticEvidence } : {}),
        detail: `${disputed.length} disputed claim(s): ${disputed
          .slice(0, 3)
          .map((d) => d.claim)
          .filter(Boolean)
          .join(' | ')}`,
      });
      return { pass: false, failedGate: 'factcheck', results };
    }
    results.push({
      name: 'factcheck',
      pass: true,
      skipped: !sourceGrounded,
      ...(sourceGrounded ? { evidence: fc as GroundedReport } : diagnosticEvidence ? { diagnosticEvidence } : {}),
      detail:
        !sourceGrounded
          ? fc.verificationMethod === 'retrieved-sources'
            ? `Ufuldstændigt kildefaktatjek: ${Array.isArray(fc.blockers) && fc.blockers.length
              ? fc.blockers.filter(b => typeof b === 'string').slice(0, 3).join(' ')
              : 'Artikelversion, aktualitet eller evidens kunne ikke godkendes.'}`
            : 'Ingen fuldstændig kildebaseret verifikation. Modelvurderingen er kun rådgivende.'
          : `${checked.length} påstande tjekket, 0 disputed`,
    });
  }

  // Do not buy an editorial review of a version that already cannot pass.
  // Keep the exact diagnostic report available for the one targeted repair.
  if (requireCompleteVerification && anyGateSkipped) {
    results.push({ name: 'verification-complete', pass: false,
      detail: 'Mindst én sikkerhedsgate blev sprunget over; auto-publish er blokeret.' });
    return { pass: false, failedGate: 'verification-complete', results, anyGateSkipped };
  }

  // Both gates come from the same real assessment. Missing editorial evidence
  // must block; never fall back to a second paid critic or infer voice approval
  // from factual completeness alone.
  if (consolidated) {
    const editorial = readLivEditorialEvidence(fc?.editorialReview, factcheckText, voiceHash);
    if (!editorial) {
      results.push({ name: 'tov', pass: false, skipped: true, detail: 'Den samlede vurdering mangler gyldigt redaktionelt belæg.' });
      results.push({ name: 'verification-complete', pass: false, detail: 'Den redaktionelle vurdering er ikke fuldstændig.' });
      return { pass: false, failedGate: 'verification-complete', anyGateSkipped: true, results };
    }
    const pass = editorialVerdictPasses(editorial);
    results.push({ name: 'tov', pass, detail: pass ? editorial.summary : editorial.blockingIssues
      .map(issue => `${issue.kind}: ${issue.explanation} (${issue.articleQuote})`).join(' | ') });
    return { pass, ...(!pass ? { failedGate: 'tov' } : {}), results, anyGateSkipped };
  }

  // --- Gate 3: legacy advisory critic for non-Liv/manual flows ---
  const tovUrl = new URL('/api/critic/tov', baseUrl).toString();
  const tov = await postJson<TovResponse>(tovUrl, { text: fullText, author: authorName }, timeoutMs);
  const tipsRaw = tov?.data?.tips || '';
  if (!tipsRaw.trim()) anyGateSkipped = true;
  // TOV-gate er informativ — vi blokerer kun hvis kritiker eksplicit siger
  // "AFVIST" / "REJECTED" / "STOP" (case-insensitive). Ellers accepteres.
  const tipsLower = tipsRaw.toLowerCase();
  if (/\b(afvist|rejected|stop|publicér ikke|publish not)\b/.test(tipsLower)) {
    results.push({
      name: 'tov',
      pass: false,
      detail: `Kritikeren afviste teksten: ${tipsRaw.slice(0, 200)}`,
    });
    return { pass: false, failedGate: 'tov', results };
  }
  results.push({
    name: 'tov',
    pass: true,
    skipped: !tipsRaw.trim(),
    detail: tipsRaw ? `Tips logget (${tipsRaw.length} tegn)` : 'Ingen kritik returneret',
  });

  if (requireCompleteVerification && anyGateSkipped) {
    results.push({
      name: 'verification-complete',
      pass: false,
      detail: 'Mindst én sikkerhedsgate blev sprunget over; auto-publish er blokeret.',
    });
    return { pass: false, failedGate: 'verification-complete', results, anyGateSkipped };
  }

  return { pass: true, results, anyGateSkipped };
}
