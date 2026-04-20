/**
 * Liv Brandt — sikkerhedsporte før auto-publish.
 *
 * Tre gates kaldes sekventielt — første failure stopper publish:
 *  1. Moderation (plagiat-/lighedstjek + min. ordtælling)
 *  2. Factcheck (OpenAI vurderer påstande udtrukket fra brødtekst)
 *  3. TOV (kort kritiker-evaluering — vi accepterer alle tips, men logger dem)
 *
 * Hver gate returneres som `{ name, pass, detail }` og gemmes i Firestore
 * for transparens.
 */

import type { GateResult } from '@/lib/liv/daily-history-store';
import { logger } from '@/lib/logger';
import { checkSourceSimilarity } from '@/lib/liv/source-similarity';

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
}

export interface SafetyGatesOutput {
  pass: boolean;
  failedGate?: string;
  results: GateResult[];
}

interface ModerationResponse {
  data?: {
    metrics?: { plagiarismRisk?: 'low' | 'medium' | 'high'; wordCount?: number; maxSim?: number };
    nearest?: { title?: string; url?: string };
  };
}

interface FactcheckResponse {
  ok?: boolean;
  results?: Array<{
    claim?: string;
    status?: 'verified' | 'disputed' | 'unverifiable' | string;
    confidence?: number;
  }>;
}

interface TovResponse {
  data?: { tips?: string };
}

async function postJson<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (e) {
    logger.warn('[liv/safety-gates] fetch failed', { url, err: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export async function runSafetyGates(input: SafetyGatesInput): Promise<SafetyGatesOutput> {
  const { baseUrl, title, content, intro, authorName = 'Liv Brandt', sourceExcerpt } = input;
  const results: GateResult[] = [];
  const fullText = [intro, content].filter(Boolean).join('\n\n');

  // --- Gate 0: Source similarity (paraphrasing/strukturel kopiering af kilden) ---
  // Køres først fordi det er det mest direkte plagiat-signal når Liv har
  // arbejdet med en konkret inspirationskilde.
  if (sourceExcerpt && sourceExcerpt.trim().length >= 80) {
    try {
      const sim = await checkSourceSimilarity({
        generated: fullText,
        source: sourceExcerpt,
      });
      if (!sim.pass) {
        const detail = `Kilde-lighed for høj — ${sim.reason}. Scores: emb=${sim.scores.embeddingSim.toFixed(3)}, ngram=${sim.scores.ngramJaccard.toFixed(3)}, opening=${sim.scores.openingSim.toFixed(3)}.`;
        results.push({ name: 'source-similarity', pass: false, detail });
        return { pass: false, failedGate: 'source-similarity', results };
      }
      results.push({
        name: 'source-similarity',
        pass: true,
        detail: `emb=${sim.scores.embeddingSim.toFixed(3)}, ngram=${sim.scores.ngramJaccard.toFixed(3)}, opening=${sim.scores.openingSim.toFixed(3)}`,
      });
    } catch (e) {
      // Ved fejl i embedding-API'et tillader vi publish, men logger advarsel.
      // Lexical-checks er allerede billige, så det er sjældent vi havner her.
      logger.warn('[liv/safety-gates] source-similarity check threw — skipping gate', {
        err: e instanceof Error ? e.message : String(e),
      });
      results.push({
        name: 'source-similarity',
        pass: true,
        detail: 'Gate sprunget over pga. fejl i similarity-tjek',
      });
    }
  } else {
    results.push({
      name: 'source-similarity',
      pass: true,
      detail: 'Ingen sourceExcerpt — gate sprunget over',
    });
  }

  // --- Gate 1: Moderation ---
  const modUrl = new URL('/api/moderation/check', baseUrl).toString();
  const mod = await postJson<ModerationResponse>(modUrl, { title, content: fullText });

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
  const fc = await postJson<FactcheckResponse>(fcUrl, {
    articleText: fullText.slice(0, 6000),
  });

  if (!fc?.ok) {
    // Hvis factcheck-API ikke er tilgængeligt, accepter — vi vil ikke
    // blokere publish for infrastruktur-problemer. Log advarsel.
    results.push({ name: 'factcheck', pass: true, detail: 'API utilgængeligt — gate sprunget over' });
  } else {
    const checked = fc.results || [];
    const disputed = checked.filter((r) => r.status === 'disputed');
    if (disputed.length > 0) {
      results.push({
        name: 'factcheck',
        pass: false,
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
      detail: `${checked.length} påstande tjekket, 0 disputed`,
    });
  }

  // --- Gate 3: TOV (rådgivende) ---
  const tovUrl = new URL('/api/critic/tov', baseUrl).toString();
  const tov = await postJson<TovResponse>(tovUrl, { text: fullText, author: authorName });
  const tipsRaw = tov?.data?.tips || '';
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
    detail: tipsRaw ? `Tips logget (${tipsRaw.length} tegn)` : 'Ingen kritik returneret',
  });

  return { pass: true, results };
}
