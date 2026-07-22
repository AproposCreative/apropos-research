import type { ArticleEvidence, EditorialAnalysisV1 } from '@/lib/seo-engine/schema';
import { hashQuote } from '@/lib/seo-engine/hash';

export type EvidenceIssue = {
  path: string;
  code:
    | 'offset_mismatch'
    | 'quote_hash_mismatch'
    | 'article_hash_mismatch'
    | 'quote_too_long'
    | 'invalid_range';
  message: string;
};

function verifyOne(
  ev: ArticleEvidence,
  normalizedText: string,
  expectedArticleHash: string,
  path: string
): EvidenceIssue[] {
  const issues: EvidenceIssue[] = [];
  if (ev.quote.length > 180) {
    issues.push({
      path,
      code: 'quote_too_long',
      message: 'Evidence quote over 180 tegn',
    });
  }
  if (ev.startOffset < 0 || ev.endOffset < ev.startOffset || ev.endOffset > normalizedText.length) {
    issues.push({
      path,
      code: 'invalid_range',
      message: 'Evidence-offsets uden for normalizedText',
    });
    return issues;
  }
  const slice = normalizedText.slice(ev.startOffset, ev.endOffset);
  if (slice !== ev.quote) {
    // Allow whitespace-normalized equality for soft recovery
    if (slice.replace(/\s+/g, ' ').trim() !== ev.quote.replace(/\s+/g, ' ').trim()) {
      issues.push({
        path,
        code: 'offset_mismatch',
        message: 'Quote matcher ikke normalizedText ved offsets',
      });
    }
  }
  const expectedHash = hashQuote(ev.quote);
  if (ev.quoteHash !== expectedHash) {
    issues.push({
      path,
      code: 'quote_hash_mismatch',
      message: 'quoteHash matcher ikke',
    });
  }
  if (ev.articleVersionHash !== expectedArticleHash) {
    issues.push({
      path,
      code: 'article_hash_mismatch',
      message: 'articleVersionHash matcher ikke inputVersionHash',
    });
  }
  return issues;
}

function collectJudgementEvidence(
  judgement: { evidence?: ArticleEvidence[] } | undefined,
  path: string
): Array<{ ev: ArticleEvidence; path: string }> {
  if (!judgement?.evidence?.length) return [];
  return judgement.evidence.map((ev, i) => ({ ev, path: `${path}.evidence[${i}]` }));
}

/** Collect all evidence nodes from an analysis. */
export function collectAnalysisEvidence(
  analysis: EditorialAnalysisV1
): Array<{ ev: ArticleEvidence; path: string }> {
  const out: Array<{ ev: ArticleEvidence; path: string }> = [];
  out.push(...collectJudgementEvidence(analysis.topic, 'topic'));
  out.push(...collectJudgementEvidence(analysis.angleOrThesis, 'angleOrThesis'));
  out.push(...collectJudgementEvidence(analysis.stanceOrVerdict, 'stanceOrVerdict'));
  (analysis.primaryEntity.evidence || []).forEach((ev, i) => {
    out.push({ ev, path: `primaryEntity.evidence[${i}]` });
  });
  return out;
}

/**
 * Verify evidence against snapshot.normalizedText.
 * Returns issues; caller may strip invalid evidence and/or penalize confidence.
 */
export function verifyEvidenceAgainstSnapshot(args: {
  analysis: EditorialAnalysisV1;
  normalizedText: string;
  inputVersionHash: string;
}): {
  issues: EvidenceIssue[];
  analysis: EditorialAnalysisV1;
  invalidEvidenceCount: number;
  validEvidenceCount: number;
} {
  const collected = collectAnalysisEvidence(args.analysis);
  const issues: EvidenceIssue[] = [];
  const invalidPaths = new Set<string>();

  for (const { ev, path } of collected) {
    const local = verifyOne(ev, args.normalizedText, args.inputVersionHash, path);
    if (local.length) {
      issues.push(...local);
      invalidPaths.add(path);
    }
  }

  // Strip invalid evidence arrays (keep analysis otherwise)
  const cleaned: EditorialAnalysisV1 = structuredClone(args.analysis);

  const filterList = (list: ArticleEvidence[] | undefined, basePath: string) =>
    (list || []).filter((_, i) => !invalidPaths.has(`${basePath}[${i}]`));

  if (cleaned.topic.evidence) {
    cleaned.topic.evidence = filterList(cleaned.topic.evidence, 'topic.evidence');
  }
  if (cleaned.angleOrThesis.evidence) {
    cleaned.angleOrThesis.evidence = filterList(
      cleaned.angleOrThesis.evidence,
      'angleOrThesis.evidence'
    );
  }
  if (cleaned.stanceOrVerdict.evidence) {
    cleaned.stanceOrVerdict.evidence = filterList(
      cleaned.stanceOrVerdict.evidence,
      'stanceOrVerdict.evidence'
    );
  }
  cleaned.primaryEntity.evidence = filterList(
    cleaned.primaryEntity.evidence,
    'primaryEntity.evidence'
  );

  // Repair quoteHash / articleVersionHash on remaining valid evidence
  const repair = (ev: ArticleEvidence): ArticleEvidence => ({
    ...ev,
    quoteHash: hashQuote(ev.quote),
    articleVersionHash: args.inputVersionHash,
  });
  if (cleaned.topic.evidence) cleaned.topic.evidence = cleaned.topic.evidence.map(repair);
  if (cleaned.angleOrThesis.evidence) {
    cleaned.angleOrThesis.evidence = cleaned.angleOrThesis.evidence.map(repair);
  }
  if (cleaned.stanceOrVerdict.evidence) {
    cleaned.stanceOrVerdict.evidence = cleaned.stanceOrVerdict.evidence.map(repair);
  }
  cleaned.primaryEntity.evidence = cleaned.primaryEntity.evidence.map(repair);

  const validEvidenceCount = collectAnalysisEvidence(cleaned).length;
  return {
    issues,
    analysis: cleaned,
    invalidEvidenceCount: invalidPaths.size,
    validEvidenceCount,
  };
}

/** Apply confidence penalty when evidence was invalid/missing. Mutates a copy. */
export function applyEvidenceConfidencePenalty(
  analysis: EditorialAnalysisV1,
  invalidEvidenceCount: number
): EditorialAnalysisV1 {
  if (invalidEvidenceCount <= 0) return analysis;
  const next = structuredClone(analysis);
  const penalize = (c: number) => Math.max(0, Math.min(1, c - Math.min(0.35, 0.1 * invalidEvidenceCount)));
  next.topic.confidence = penalize(next.topic.confidence);
  next.angleOrThesis.confidence = penalize(next.angleOrThesis.confidence);
  next.stanceOrVerdict.confidence = penalize(next.stanceOrVerdict.confidence);
  next.primaryEntity.confidence = penalize(next.primaryEntity.confidence);
  next.articleType.confidence = penalize(next.articleType.confidence);
  return next;
}
