import { describe, expect, it, afterEach, vi } from 'vitest';
import { loadLivVoice, isLivAuthor } from '@/lib/liv/voice';
import { buildPromptSegments, composeSystemPrompt } from '@/lib/ai-chat/build-system-prompt';
import { isLivArticleFormat, parseResearchRating } from '@/lib/liv/review-format';
import { livModels } from '@/lib/liv/model-config';
import { buildLivCmsPayload } from '@/lib/liv/build-cms-payload';

afterEach(() => vi.unstubAllEnvs());
const reason = 'Den konkrete konflikt giver vurderingen tyngde, men slutningen er svagere underbygget.';

describe('Liv voice and review contract', () => {
  it('loads v4 with an auditable content hash and no generic fallback', () => {
    const voice = loadLivVoice();
    expect(voice.version).toBe('liv-v4');
    expect(voice.text).toContain('én selvstændig tese');
    expect(voice.text).toContain('én sekundær kilde');
    expect(voice.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(voice.text).toContain('tør humor');
    expect(voice.text).toContain('eksisterende CMS-toggle');
  });
  it('uses canonical Liv voice in Writer even if the optional old author-TOV is disabled', () => {
    const prompt = composeSystemPrompt(buildPromptSegments('Ældre profil', 'Liv Brandt', {}, undefined,
      { openingStrategyOverride: 'En konkret åbning' }), { 'author-tov': false }, null);
    expect(prompt).toContain(loadLivVoice().text);
    expect(prompt).not.toContain('Ældre profil');
    expect(composeSystemPrompt(buildPromptSegments('', 'Frederik', {}), {}, null)).not.toContain('LIV BRANDT - PROMPT (v4)');
    expect(isLivAuthor(' Liv-Brandt ')).toBe(true);
  });
  it('shares the standing online-image instruction without inventing rights clearance', () => {
    const voice = loadLivVoice();
    expect(voice.text).toContain('uden at spørge redaktionen igen');
    expect(voice.text).toContain('officielle stillbilleder fra værket');
    expect(voice.text).toContain('kræver ikke særskilt dokumentation');
    expect(voice.text).toContain('original billed-URL');
    expect(voice.text).toContain('Registrér ikke brugsret som verificeret, hvis den er ukendt');
    expect(voice.text).toContain('Søgning og billedgenerering er begge muligheder');
    expect(voice.text).toContain('mindst to forskellige, relevante billeder i brødteksten ud over hovedbilledet');
    expect(voice.text).toContain('Hovedbillede, mobilbillede og trailer-thumbnail tæller ikke med');
    expect(voice.text).toContain('alt-tekst, en kort billedtekst og korrekt credit');
    expect(voice.text).toContain('Gentag ikke samme billede og opfind ikke billed-URL');
    const prompt = composeSystemPrompt(buildPromptSegments('', 'Liv Brandt', {}, undefined,
      { openingStrategyOverride: 'En konkret åbning' }), { 'author-tov': false }, null);
    expect(prompt).toContain(voice.text);
  });
  it('keeps source-backed personal voice calibration in the canonical prompt', () => {
    const voice = loadLivVoice();
    expect(voice.text).toContain('Stilkalibrering: 2026-09-10');
    expect(voice.text).toContain('vurderende jeg, aldrig et opdigtet oplevelses-jeg');
    expect(voice.text).toContain('Bevar attribution også efter en sproglig omskrivning');
    expect(voice.text).toContain('Ingen obligatorisk punchline i hvert afsnit');
    expect(voice.text).toContain('Saros: anerkend håndværket');
  });
  it('accepts an explicit rating with rationale', () => {
    expect(parseResearchRating(`Rating: 4\nRatingReason: ${reason}`, 'research-review')).toEqual({ value: 4, reason });
    expect(parseResearchRating('En almindelig artikel', 'article')).toBeNull();
    expect(isLivArticleFormat('review')).toBe(false);
  });
  it('carries cultural interpretation requirements into the shared voice and Writer', () => {
    const voice = loadLivVoice();
    for (const requirement of [
      'KULTURFAGLIG FORTOLKNING',
      'konkret belæg til formgreb til fortolkning til kulturel konsekvens',
      'mindst to forskellige dokumenterede detaljer',
      'Intention er ikke facit',
      'En genudgivet pressemeddelelse er samme kildeoprindelse',
      'Afprøv tesen mod en konkret modlæsning',
      'En illustration er ikke dokumentation for originalværkets farver eller form',
      'ikke dokumentation for en bestået automatisk kontrol',
    ]) expect(voice.text).toContain(requirement);
    const writer = composeSystemPrompt(buildPromptSegments('', 'Liv Brandt', {}, undefined,
      { openingStrategyOverride: 'En konkret åbning' }), { 'author-tov': false }, null);
    expect(writer).toContain(voice.text);
    // Checks prompt propagation only, not the literary quality of model output.
  });
  it('preserves the requested young Copenhagen viewpoint with reasoned opinions and comparisons', () => {
    const voice = loadLivVoice();
    expect(voice.text).toContain('UNG KØBENHAVNSK STEMME MED SMAG OG KANT');
    expect(voice.text).toContain('ikke en neutral referent');
    expect(voice.text).toContain('Vis forbindelsen, ikke bare et kendt navn');
    expect(voice.text).toContain('En stærk holdning må gerne være begejstring');
    expect(voice.text).toContain('København er hendes ståsted, ikke målestokken for alle andre');
    expect(voice.text).toContain('faktapåstande om andre værker skal have belæg');
  });
  it('uses the 50-article calibration and selective critic attribution in Writer', () => {
    const voice = loadLivVoice();
    expect(voice.text).toContain('THE APROPOS SPIRIT (50 arkivtekster læst');
    expect(voice.text).toContain('Ingen linkkvote og ingen pligt til at nævne en kritiker');
    expect(voice.text).toContain('udelad den lånte dom frem for blot at fjerne afsenderen');
    expect(voice.text).toContain('strukturerede kilderegister');
    expect(voice.text).toContain('Lad din skepsis risikere at tabe');
    const writer = composeSystemPrompt(buildPromptSegments('', 'Liv Brandt', {}, undefined,
      { openingStrategyOverride: 'En konkret åbning' }), { 'author-tov': false }, null);
    expect(writer).toContain(voice.text);
  });
  it.each(['0', '7', '4.5', '4/6', 'fire', ''])('rejects invalid rating %s', value => {
    expect(() => parseResearchRating(`Rating: ${value}\nRatingReason: ${reason}`, 'research-review')).toThrow();
  });
  it('rejects unrequested, unreasoned or duplicate ratings', () => {
    expect(() => parseResearchRating(`Rating: 4\nRatingReason: ${reason}`, 'article')).toThrow();
    expect(() => parseResearchRating('Rating: 4', 'research-review')).toThrow();
    expect(() => parseResearchRating(`Rating: 4\nRating: 5\nRatingReason: ${reason}`, 'research-review')).toThrow();
  });
  it('disables the public AI flag, passes stars and preserves actual model provenance', () => {
    const article = { title: 'The Invite', subtitle: 'En dom', intro: 'En indledning.', content: 'En selvstændig tekst.',
      slug: 'the-invite', excerpt: 'Et uddrag', section: 'Film', tags: [], rawResponse: '',
      articleFormat: 'research-review' as const, rating: 4, ratingReason: reason, aiModel: 'actual-model-snapshot' };
    const payload = buildLivCmsPayload({ article, topic: { title: 'The Invite', score: 1 }, aiModel: 'incorrect-fallback' });
    expect(payload).toMatchObject({ articleFormat: 'research-review', rating: 4, ratingReason: reason });
    expect(payload.aiGenerated).toBe(false);
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
