import { describe, expect, it } from 'vitest';
import { decideMetadataUpdate, reviewKey, type PublishedArticle, type FieldAssessment } from '../../../lib/seo-engine/post-publish/policy';

const article: PublishedArticle = {
  itemId: 'article-1', locale: 'da', published: true, hasUnpublishedChanges: false,
  contentVersion: 'body-v1', metadata: { seoTitle: 'Mayday (Apple TV)', metaDescription: 'En anmeldelse af Mayday.' },
};
const assessments: FieldAssessment[] = [
  { field: 'seoTitle', verdict: 'improve', reason: 'Gør anmeldelsens søgeintention tydelig.',
    proposedValue: 'Mayday på Apple TV: Anmeldelse', verifiedAgainstArticle: true },
  { field: 'metaDescription', verdict: 'keep', reason: 'Dækker artiklen.', verifiedAgainstArticle: true },
];
const base = { analyzed: article, fresh: article, assessments, lockedFields: [],
  mode: 'publication_quality' as const, nowMs: Date.parse('2026-09-12T12:00:00Z') };

describe('post-publication metadata policy', () => {
  it('can improve a filled title before any search data exists', () => {
    expect(decideMetadataUpdate(base)).toEqual({ action: 'apply', reason: 'verified_improvement',
      patch: { seoTitle: 'Mayday på Apple TV: Anmeldelse' } });
  });
  it('preserves an editor-locked title', () => {
    expect(decideMetadataUpdate({ ...base, lockedFields: ['seoTitle'] }).action).toBe('keep');
  });
  it.each(['contentVersion', 'locale', 'itemId'] as const)('refuses a changed %s', field => {
    expect(decideMetadataUpdate({ ...base, fresh: { ...article, [field]: 'changed' } as PublishedArticle }).reason).toBe('article_changed');
  });
  it('does not overwrite an editor changing metadata during generation', () => {
    expect(decideMetadataUpdate({ ...base, fresh: { ...article, metadata: { ...article.metadata, seoTitle: 'Redaktørens valg' } } }).action).toBe('defer');
  });
  it('does not release staged editorial changes', () => {
    expect(decideMetadataUpdate({ ...base, fresh: { ...article, hasUnpublishedChanges: true } }).reason).toBe('editorial_draft');
  });
  it('does not publish an unpublished article', () => {
    expect(decideMetadataUpdate({ ...base, fresh: { ...article, published: false } }).reason).toBe('not_published');
  });
  it('rejects self-certified or incomplete AI output', () => {
    expect(decideMetadataUpdate({ ...base, assessments: [{ ...assessments[0], verifiedAgainstArticle: false }, assessments[1]] }).action).toBe('needs_editor');
    expect(decideMetadataUpdate({ ...base, assessments: [assessments[0]] }).action).toBe('needs_editor');
  });
  it('does not keep rewriting after its own publish event', () => {
    expect(decideMetadataUpdate({ ...base, lastAppliedAt: '2026-09-12T11:59:00Z' }).reason).toBe('cooldown');
  });
  it('requires comparable search evidence for performance changes', () => {
    expect(decideMetadataUpdate({ ...base, mode: 'performance' }).reason).toBe('insufficient_performance_evidence');
    const evidence = { currentImpressions: 500, previousImpressions: 400, currentDays: 28,
      previousDays: 28, comparable: true, fetchedAt: '2026-09-12T10:00:00Z' };
    expect(decideMetadataUpdate({ ...base, mode: 'performance', evidence }).action).toBe('apply');
    expect(decideMetadataUpdate({ ...base, mode: 'performance', evidence: { ...evidence, previousImpressions: 10 } }).action).toBe('defer');
    expect(decideMetadataUpdate({ ...base, mode: 'performance', evidence: { ...evidence, fetchedAt: '2026-09-01' } }).action).toBe('defer');
  });
  it('keys duplicate delivery identically and locales separately', () => {
    expect(reviewKey({ ...article })).toBe(reviewKey(article));
    expect(reviewKey({ ...article, locale: 'en' })).not.toBe(reviewKey(article));
  });
});
