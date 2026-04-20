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
  reason?: string;
  scores: SourceSimilarityScores;
}

const DEFAULT_THRESHOLDS = {
  /** Cosine sim > 0.85 ≈ samme historie/vinkel. */
  embedding: 0.85,
  /** 4-gram Jaccard > 0.18 ≈ tydelig paraphrasing. */
  ngram: 0.18,
  /** Åbningssætnings-overlap > 0.55 ≈ samme dramaturgiske åbning. */
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
 * kaldet hvis input er for kort (returnerer pass=true).
 */
export async function checkSourceSimilarity(
  input: SourceSimilarityInput
): Promise<SourceSimilarityResult> {
  const t = { ...DEFAULT_THRESHOLDS, ...input.thresholds };

  const generated = (input.generated || '').trim();
  const source = (input.source || '').trim();

  // Ingen kilde at sammenligne mod — gate'en er ikke relevant, lad den passere.
  if (source.length < 80 || generated.length < 80) {
    return {
      pass: true,
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
  try {
    const [genEmb, srcEmb] = await Promise.all([
      getEmbedding(generated.slice(0, 4000)),
      getEmbedding(source.slice(0, 4000)),
    ]);
    embeddingSim = cosineSimilarity(genEmb, srcEmb);
  } catch (e) {
    logger.warn('[liv/source-similarity] embedding failed — falling back to lexical only', {
      err: e instanceof Error ? e.message : String(e),
    });
  }

  const scores: SourceSimilarityScores = {
    embeddingSim,
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

  if (reasons.length > 0) {
    return {
      pass: false,
      reason: reasons.join(' | '),
      scores,
    };
  }

  return { pass: true, scores };
}
