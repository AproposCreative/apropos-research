import { describe, expect, it, vi } from 'vitest';
import { reviewPublishedMetadata } from '../../../lib/seo-engine/post-publish/review';

const article = { editorialTitle: 'Mayday', locale: 'da' as const, body: 'En konkret anmeldelse af filmen Mayday. '.repeat(8),
  metadata: { seoTitle: 'Mayday', metaDescription: 'En konkret anmeldelse af filmen.' } };
const keep = { verdict: 'keep', reason: 'Præcis.', proposedValue: null };
const improve = { verdict: 'improve', reason: 'Gør søgeintention tydelig.', proposedValue: 'Mayday: Anmeldelse' };

describe('AI metadata review', () => {
  it('keeps good metadata without paying for a second generation', async () => {
    const call = vi.fn().mockResolvedValue(JSON.stringify({ seoTitle: keep, metaDescription: keep }));
    const result = await reviewPublishedMetadata(article, call);
    expect(call).toHaveBeenCalledTimes(1);
    expect(result.assessments.every(a => a.verdict === 'keep')).toBe(true);
  });
  it('requires an independent fact and improvement check', async () => {
    const call = vi.fn().mockResolvedValueOnce(JSON.stringify({ seoTitle: improve, metaDescription: keep }))
      .mockResolvedValueOnce(JSON.stringify({ seoTitle: { supported: false, better: true, reason: 'Ikke dækkende.' },
        metaDescription: { supported: true, better: false, reason: 'Uændret.' } }));
    const result = await reviewPublishedMetadata(article, call);
    expect(result.assessments[0].verifiedAgainstArticle).toBe(false);
    expect(call.mock.calls[1][0].stage).toBe('verify');
    expect(JSON.parse(call.mock.calls[1][0].input)).not.toHaveProperty('reason');
  });
  it('does not silently use a fallback for malformed output', async () => {
    await expect(reviewPublishedMetadata(article, async () => 'not JSON')).rejects.toThrow();
    await expect(reviewPublishedMetadata(article, async () => JSON.stringify({ seoTitle: improve }))).rejects.toThrow();
  });
  it('rejects incomplete or oversized source input before making paid calls', async () => {
    const call = vi.fn();
    await expect(reviewPublishedMetadata({ ...article, body: '' }, call)).rejects.toThrow('insufficient_article_content');
    await expect(reviewPublishedMetadata({ ...article, body: 'x'.repeat(100_001) }, call)).rejects.toThrow('article_requires_long_review');
    expect(call).not.toHaveBeenCalled();
  });
});
