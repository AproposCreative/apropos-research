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
 *   2. **Ord-5-gram Jaccard** og sammenhængende 12-ords overlap.
 *   3. **Åbningssætnings-lighed** (lexikalt signal, ikke dramaturgisk bevis).
 *
 * Leksikalske overskridelser blokerer. En isoleret semantisk overskridelse
 * kræver dokumenteret kvalitativ kontrol. Ingen score alene beviser plagiat.
 * Ordmetoden kræver fortsat kalibrering på redaktionelt bedømte eksempler.
 */

import { cosineSimilarity, getEmbedding } from '@/lib/embeddings';
import { logger } from '@/lib/logger';
import { hasCopiedPassage } from '@/lib/liv/research-bundle';
import { reviewSemanticSource, type SemanticSourceReview } from './semantic-source-review';

export interface SourceSimilarityScores {
  embeddingSim: number;
  ngramJaccard: number;
  openingSim: number;
  /** Diagnostic only: common character sequences are not copied phrases. */
  characterJaccard?: number;
  copiedPassage?: boolean;
}

export interface SourceSimilarityResult {
  pass: boolean;
  complete: boolean;
  reason?: string;
  failure?: 'input-too-short' | 'input-too-long' | 'embedding-unavailable' | 'embedding-invalid' | 'similarity-exceeded' | 'semantic-review-unavailable';
  method?: 'word-5gram-v2';
  scores: SourceSimilarityScores;
  semanticReview?: SemanticSourceReview;
}

const DEFAULT_THRESHOLDS = {
  /** Conservative review trigger, not a finding of plagiarism. */
  embedding: 0.85,
  /** Overlap of actual five-word sequences, not common Danish character fragments. */
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

function wordNGrams(text: string, n = 5): Set<string> {
  const words = text.split(' ').filter(Boolean);
  const grams = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) grams.add(words.slice(i, i + n).join(' '));
  return grams;
}

export function lexicalSourceScores(generated: string, source: string) {
  const genNorm = normalizeText(generated);
  const srcNorm = normalizeText(source);
  return {
    ngramJaccard: jaccard(wordNGrams(genNorm), wordNGrams(srcNorm)),
    characterJaccard: jaccard(charNGrams(genNorm.slice(0, 6000)), charNGrams(srcNorm.slice(0, 6000))),
    openingSim: jaccard(charNGrams(firstWords(generated, 25)), charNGrams(firstWords(source, 25))),
    copiedPassage: hasCopiedPassage(generated, source),
  };
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

  if (source.length > 60000 || generated.length > 60000) {
    return { pass: false, complete: false, failure: 'input-too-long', method: 'word-5gram-v2',
      reason: 'Tekstgrundlaget er for stort til en fuldstændig kontrol.',
      scores: { embeddingSim: 0, ngramJaccard: 0, openingSim: 0 } };
  }

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

  // Full-text phrase checks. Keep the old char score as a diagnostic only.
  const lexical = lexicalSourceScores(generated, source);
  const { ngramJaccard, openingSim } = lexical;

  // 1) Existing semantic screen covers the first 4000 characters per side.
  // It is a review signal, not full-document semantic or plagiarism proof.
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
    ...lexical,
  };

  const reasons: string[] = [];
  if (lexical.copiedPassage) reasons.push('copied-passage: mindst 12 sammenhængende ord');
  if (embeddingSim > t.embedding) {
    reasons.push(`embedding=${embeddingSim.toFixed(3)} > ${t.embedding}`);
  }
  if (ngramJaccard > t.ngram) {
    reasons.push(`word5gram=${ngramJaccard.toFixed(3)} > ${t.ngram}`);
  }
  if (openingSim > t.opening) {
    reasons.push(`opening=${openingSim.toFixed(3)} > ${t.opening}`);
  }

  if (!complete) {
    return { pass: false, complete: false, failure, method: 'word-5gram-v2',
      reason: failure === 'embedding-invalid'
        ? 'Lighedstjenesten returnerede ugyldige måledata.'
        : 'Lighedstjenesten kunne ikke gennemføre kontrollen.', scores };
  }

  // Only a complete semantic-only trigger can enter qualitative review. Full
  // lexical/copy/opening hard stops above cannot be overridden by a model.
  if (embeddingSim > t.embedding && !lexical.copiedPassage && ngramJaccard <= t.ngram && openingSim <= t.opening) {
    try {
      const semanticReview = await reviewSemanticSource(generated, source);
      if (semanticReview.decision === 'independent') return { pass: true, complete: true,
        method: 'word-5gram-v2', scores, semanticReview };
      return { pass: false, complete: true, failure: 'similarity-exceeded', method: 'word-5gram-v2', scores,
        semanticReview, reason: 'Den kvalitative kildekontrol dokumenterer ikke tilstrækkelig uafhængighed.' };
    } catch {
      return { pass: false, complete: false, failure: 'semantic-review-unavailable', method: 'word-5gram-v2', scores,
        reason: 'Den kvalitative kildekontrol kunne ikke gennemføres med gyldig dokumentation.' };
    }
  }

  if (reasons.length > 0) {
    return {
      pass: false,
      complete,
      method: 'word-5gram-v2',
      failure: 'similarity-exceeded',
      reason: reasons.join(' | '),
      scores,
    };
  }

  return { pass: true, complete, method: 'word-5gram-v2', scores };
}
