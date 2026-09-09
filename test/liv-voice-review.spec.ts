import { describe, expect, it, afterEach, vi } from 'vitest';
import { loadLivVoice, isLivAuthor } from '@/lib/liv/voice';
import { buildPromptSegments, composeSystemPrompt } from '@/lib/ai-chat/build-system-prompt';
import { isLivArticleFormat, parseResearchRating } from '@/lib/liv/review-format';
import { livModels } from '@/lib/liv/model-config';
import { buildLivCmsPayload } from '@/lib/liv/build-cms-payload';

afterEach(() => vi.unstubAllEnvs());
const reason = 'Den konkrete konflikt giver vurderingen tyngde, men slutningen er svagere underbygget.';

describe('Liv voice and review contract', () => {
  it('loads v3 with an auditable content hash and no generic fallback', () => {
    const voice = loadLivVoice();
    expect(voice.version).toBe('liv-v3');
    expect(voice.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(voice.text).toContain('tør humor');
    expect(voice.text).toContain('eksisterende CMS-toggle');
  });
  it('uses canonical Liv voice in Writer even if the optional old author-TOV is disabled', () => {
    const prompt = composeSystemPrompt(buildPromptSegments('Ældre profil', 'Liv Brandt', {}, undefined,
      { openingStrategyOverride: 'En konkret åbning' }), { 'author-tov': false }, null);
    expect(prompt).toContain(loadLivVoice().text);
    expect(prompt).not.toContain('Ældre profil');
    expect(composeSystemPrompt(buildPromptSegments('', 'Frederik', {}), {}, null)).not.toContain('LIV BRANDT - PROMPT (v3)');
    expect(isLivAuthor(' Liv-Brandt ')).toBe(true);
  });
  it('accepts an explicit rating with rationale', () => {
    expect(parseResearchRating(`Rating: 4\nRatingReason: ${reason}`, 'research-review')).toEqual({ value: 4, reason });
    expect(parseResearchRating('En almindelig artikel', 'article')).toBeNull();
    expect(isLivArticleFormat('review')).toBe(false);
  });
  it.each(['0', '7', '4.5', '4/6', 'fire', ''])('rejects invalid rating %s', value => {
    expect(() => parseResearchRating(`Rating: ${value}\nRatingReason: ${reason}`, 'research-review')).toThrow();
  });
  it('rejects unrequested, unreasoned or duplicate ratings', () => {
    expect(() => parseResearchRating(`Rating: 4\nRatingReason: ${reason}`, 'article')).toThrow();
    expect(() => parseResearchRating('Rating: 4', 'research-review')).toThrow();
    expect(() => parseResearchRating(`Rating: 4\nRating: 5\nRatingReason: ${reason}`, 'research-review')).toThrow();
  });
  it('keeps the existing AI flag, passes stars and records the actual model without injecting labels', () => {
    const article = { title: 'The Invite', subtitle: 'En dom', intro: 'En indledning.', content: 'En selvstændig tekst.',
      slug: 'the-invite', excerpt: 'Et uddrag', section: 'Film', tags: [], rawResponse: '',
      articleFormat: 'research-review' as const, rating: 4, ratingReason: reason, aiModel: 'actual-model-snapshot' };
    const payload = buildLivCmsPayload({ article, topic: { title: 'The Invite', score: 1 }, aiModel: 'incorrect-fallback' });
    expect(payload.aiGenerated).toBe(true);
    expect(payload.rating).toBe(4);
    expect(payload.aiModel).toBe('actual-model-snapshot');
    expect(payload.content).toBe(article.content);
    expect(payload.intro).toBe(article.intro);
    expect(() => buildLivCmsPayload({ article: { ...article, rating: 9 }, topic: { title: '', score: 0 } })).toThrow();
  });
  it('does not invent model provenance for a legacy article', () => {
    const payload = buildLivCmsPayload({ article: { title: 'T', subtitle: '', intro: '', content: 'C', slug: 't', excerpt: '', section: 'Kultur', tags: [], rawResponse: '' }, topic: { title: 'T', score: 0 } });
    expect(payload.aiModel).toBeNull();
  });
  it('reads model overrides independently and has current documented defaults', () => {
    vi.stubEnv('LIV_GENERATION_MODEL', ''); vi.stubEnv('LIV_RESEARCH_MODEL', ''); vi.stubEnv('LIV_UTILITY_MODEL', '');
    expect(livModels()).toEqual({ article: 'gpt-5.6-sol', research: 'gpt-5.6-sol', utility: 'gpt-5.6-luna' });
    vi.stubEnv('LIV_GENERATION_MODEL', 'gpt-5.6-terra');
    expect(livModels().article).toBe('gpt-5.6-terra');
    vi.stubEnv('LIV_GENERATION_MODEL', 'claude-opus-4.7');
    expect(() => livModels()).toThrow('liv_model_invalid');
  });
});
