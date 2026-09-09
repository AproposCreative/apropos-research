/**
 * Liv Brandt — kildesimilarity-gate.
 *
 * Den eksisterende `/api/moderation/check` sammenligner kun mod Apropos'
 * embedding-corpus, så den fanger IKKE artikler der er for tæt på den
 * eksterne inspirationskilde (fx en Soundvenue-artikel).
 *
 * Dette modul tjekker den genererede artikel direkte mod kildens uddrag
 * via tre uafhængige signaler:
 *
 *   1. **Embedding cosine similarity** (semantisk lighed)
 *   2. **Karakter-n-gram Jaccard** (lexical overlap — fanger paraphrasing
 *      med samme sætningsbygning)
 *   3. **Åbningssætnings-lighed** (fanger "samme dramaturgiske åbning")
 *
 * Hver score evalueres mod en tærskel; én alvorlig overskridelse er nok
 * til at blokere publish. Tærskler er konservative — vi vil hellere have
 * en falsk positiv og logge end at publicere plagiat.
 */

import { cosineSimilarity, getEmbedding } from '@/lib/embeddings';
import { logger } from '@/lib/logger';

export interface SourceSimilarityScores {
  embeddingSim: number;
  ngramJaccard: number;
  openingSim: number;
}

export interface SourceSimilarityResult {
  pass: boolean;
  complete: boolean;
  reason?: string;
  failure?: 'input-too-short' | 'embedding-unavailable' | 'embedding-invalid' | 'similarity-exceeded';
  scores: SourceSimilarityScores;
}

const DEFAULT_THRESHOLDS = {
  /** Conservative review trigger, not a finding of plagiarism. */
  embedding: 0.85,
  /** Character overlap is language/length dependent; requires editorial calibration. */
  ngram: 0.18,
  /** Opening overlap is a review trigger, not proof of shared dramaturgy. */
  opening: 0.55,
};

/* -------------------------------------------------------------------------
 * Hjælpere
 * ------------------------------------------------------------------------- */

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Karakter-n-grams (default 4). Returnerer Set for hurtig Jaccard-beregning. */
function charNGrams(text: string, n = 4): Set<string> {
  const out = new Set<string>();
  if (text.length < n) {
    if (text.length > 0) out.add(text);
    return out;
  }
  for (let i = 0; i <= text.length - n; i++) {
    out.add(text.slice(i, i + n));
  }
  return out;
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const v of small) if (big.has(v)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function firstWords(input: string, count: number): string {
  const tokens = normalizeText(input).split(' ').filter(Boolean);
  return tokens.slice(0, count).join(' ');
}

/* -------------------------------------------------------------------------
 * Hovedtjek
 * ------------------------------------------------------------------------- */

export interface SourceSimilarityInput {
  generated: string;
  source: string;
  thresholds?: Partial<typeof DEFAULT_THRESHOLDS>;
}

/**
 * Beregn lighed mellem genereret tekst og kilde-uddrag. Kører IKKE embedding-
 * kaldet hvis input er for kort. Ufuldstændige kontroller godkendes aldrig.
 */
export async function checkSourceSimilarity(
  input: SourceSimilarityInput
): Promise<SourceSimilarityResult> {
  const t = { ...DEFAULT_THRESHOLDS, ...input.thresholds };

  const generated = (input.generated || '').trim();
  const source = (input.source || '').trim();

  // Manglende sammenligningsgrundlag er ikke en godkendelse.
  if (source.length < 80 || generated.length < 80) {
    return {
      pass: false,
      complete: false,
      failure: 'input-too-short',
      reason: 'Tekstgrundlaget er for kort til kildelighedskontrol.',
      scores: { embeddingSim: 0, ngramJaccard: 0, openingSim: 0 },
    };
  }

  // 2) N-gram Jaccard (lexical) — billig, kør altid.
  const genNorm = normalizeText(generated).slice(0, 6000);
  const srcNorm = normalizeText(source).slice(0, 6000);
  const ngramJaccard = jaccard(charNGrams(genNorm, 4), charNGrams(srcNorm, 4));

  // 3) Opening sentence overlap (de første 25 ord normaliseret).
  const openA = charNGrams(firstWords(generated, 25), 4);
  const openB = charNGrams(firstWords(source, 25), 4);
  const openingSim = jaccard(openA, openB);

  // 1) Embedding similarity — koster 1 OpenAI-kald pr. side, kør parallelt
  // hvis vi allerede har varm cache. Vi accepterer en lille latency-koster
  // for at fange semantisk plagiat.
  let embeddingSim = 0;
  let complete = false;
  let failure: SourceSimilarityResult['failure'];
  try {
    const [genEmb, srcEmb] = await Promise.all([
      getEmbedding(generated.slice(0, 4000)),
      getEmbedding(source.slice(0, 4000)),
    ]);
    embeddingSim = cosineSimilarity(genEmb, srcEmb);
    complete = genEmb.length > 0 && genEmb.length === srcEmb.length
      && genEmb.every(Number.isFinite) && srcEmb.every(Number.isFinite)
      && genEmb.some(v => v !== 0) && srcEmb.some(v => v !== 0)
      && Number.isFinite(embeddingSim);
    if (!complete) failure = 'embedding-invalid';
  } catch {
    failure = 'embedding-unavailable';
    // Never log provider error bodies, article content or credentials.
    logger.warn('[liv/source-similarity] embedding unavailable; verification incomplete');
  }

  const scores: SourceSimilarityScores = {
    embeddingSim: Number.isFinite(embeddingSim) ? embeddingSim : 0,
    ngramJaccard,
    openingSim,
  };

  const reasons: string[] = [];
  if (embeddingSim > t.embedding) {
    reasons.push(`embedding=${embeddingSim.toFixed(3)} > ${t.embedding}`);
  }
  if (ngramJaccard > t.ngram) {
    reasons.push(`ngram=${ngramJaccard.toFixed(3)} > ${t.ngram}`);
  }
  if (openingSim > t.opening) {
    reasons.push(`opening=${openingSim.toFixed(3)} > ${t.opening}`);
  }

  if (!complete) {
    return { pass: false, complete: false, failure,
      reason: failure === 'embedding-invalid'
        ? 'Lighedstjenesten returnerede ugyldige måledata.'
        : 'Lighedstjenesten kunne ikke gennemføre kontrollen.', scores };
  }

  if (reasons.length > 0) {
    return {
      pass: false,
      complete,
      failure: 'similarity-exceeded',
      reason: reasons.join(' | '),
      scores,
    };
  }

  return { pass: true, complete, scores };
}
