import { beforeEach, expect, it, vi } from 'vitest';
import { generateLivArticle } from '@/lib/liv/generate-article';
import { loadLivVoice } from '@/lib/liv/voice';
import { buildLivCmsPayload } from '@/lib/liv/build-cms-payload';

const mocks = vi.hoisted(() => ({ create: vi.fn(), search: vi.fn(), retrieve: vi.fn(), remember: vi.fn(), rememberBrief: vi.fn(), recall: vi.fn(), seo: vi.fn(), similarity: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: mocks.create } } }) }));
vi.mock('@/lib/research/service', () => ({ getResearch: mocks.search }));
vi.mock('@/lib/liv/source-archive', () => ({ rememberResearchSources: mocks.remember, rememberWritingBrief: mocks.rememberBrief, recalledSourceUrls: mocks.recall }));
vi.mock('@/lib/factcheck/source-reader', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/factcheck/source-reader')>(), retrieveSource: mocks.retrieve }));
vi.mock('@/lib/liv/fetch-official-images', () => ({ fetchOfficialImagesFromPage: async () => [] }));
vi.mock('@/lib/seo/generate-seo-meta', () => ({ generateSeoMetaAI: mocks.seo }));
vi.mock('@/lib/liv/source-similarity', () => ({ checkSourceSimilarity: mocks.similarity }));
// Evidence-note extraction is validated separately, including invented quotes and source IDs.
vi.mock('@/lib/liv/writing-brief', () => ({ buildLivWritingBrief: async () => ({ writerText: '[S1] Olivia Wilde instruerer The Invite. Seth Rogen medvirker.', notes: [] }) }));

const primaryUrl = 'https://a24films.com/films/the-invite';
const criticUrl = 'https://example.com/criticism/the-invite';
const reason = 'Præmissens præcise konflikt vejer tungt i dommen, selv om indvendingerne også skal med.';
const body = 'Olivia Wilde sætter The Invite omkring en middag. Det konkrete sammenstød giver stof til en dom, ikke blot et handlingsreferat.';
const response = (raw: string) => ({ model: 'gpt-5.6-sol-test-snapshot', choices: [{ message: { content: raw }, finish_reason: 'stop' }] });
const rawArticle = (rated = true, content = body) => JSON.stringify({ status: 'ready',
  title: 'The Invite: Middagen som magtkamp', subtitle: 'En selvstændig dom med plads til tvivl',
  intro: 'Høflighed kan være et krævende stykke arbejde.', content,
  rating: rated ? 4 : null, ratingReason: rated ? reason : null });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search.mockResolvedValue({ sources: [{ title: 'Kritik', snippet: 'Søgeresultat, ikke selve kilden', source: 'example.com', url: criticUrl }] });
  mocks.recall.mockResolvedValue([primaryUrl]);
  mocks.remember.mockResolvedValue(undefined);
  mocks.rememberBrief.mockResolvedValue(undefined);
  mocks.retrieve.mockImplementation(async (url: string, id: string) => ({ id, url, title: 'The Invite', text: 'Olivia Wilde. The Invite. Seth Rogen. '.repeat(12),
    contentHash: 'hash', publishedAt: null, retrievedAt: '2026-09-09T18:00:00Z' }));
  mocks.seo.mockResolvedValue({ seoTitle: 'The Invite: Middagen som magtkamp', seoDescription: 'En konkret vurdering af præmissen og dens konflikt.', source: 'ai' });
  mocks.similarity.mockResolvedValue({ pass: true, complete: true });
  mocks.create.mockReset().mockResolvedValueOnce(response(rawArticle()));
});

it('runs shared search, re-fetches recalled sources, applies v4 and preserves rating/model through CMS', async () => {
  const article = await generateLivArticle({ topic: { title: 'The Invite', score: 0 }, directiveHint: `Kilder: ${primaryUrl}`, articleFormat: 'research-review', sourceScope: 'editor-a' });
  expect(mocks.search).toHaveBeenCalledTimes(2);
  expect(mocks.search.mock.calls[0][1].model).toBe('gpt-5.6-sol');
  expect(mocks.retrieve).toHaveBeenCalledWith(primaryUrl, expect.any(String));
  expect(mocks.retrieve).toHaveBeenCalledWith(criticUrl, expect.any(String));
  expect(mocks.remember).toHaveBeenCalledWith('editor-a', 'The Invite', expect.arrayContaining([expect.objectContaining({ url: primaryUrl })]));
  expect(mocks.rememberBrief).toHaveBeenCalledWith('editor-a', 'The Invite', expect.objectContaining({ voiceVersion: 'liv-v4', writerText: expect.stringContaining('Seth Rogen') }));
  const request = mocks.create.mock.calls[0][0];
  expect(request.messages[0].content).toContain(loadLivVoice().text);
  expect(request.messages[0].content).toContain(primaryUrl);
  expect(request.messages[1].content).toContain('Seth Rogen');
  expect(request.messages[1].content).not.toContain('Søgeresultat, ikke selve kilden');
  expect(request).not.toHaveProperty('temperature');
  expect(request.response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true, name: 'liv_article_v1' } });
  expect(request.store).toBe(false);
  expect(mocks.seo.mock.calls[0][1].model).toBe('gpt-5.6-luna');
  expect(article.voiceHash).toBe(loadLivVoice().hash);
  const payload = buildLivCmsPayload({ article, topic: { title: 'The Invite', score: 0 } });
  expect(payload.rating).toBe(4);
  expect(payload.aiGenerated).toBe(true);
  expect(payload.aiModel).toBe('gpt-5.6-sol-test-snapshot');
  expect(payload.content).toBe(body);
  expect(payload.intro).not.toContain('Researchbaseret analyse');
});

it('stops before generation when the source archive fails', async () => {
  mocks.remember.mockRejectedValueOnce(new Error('archive down'));
  await expect(generateLivArticle({ topic: { title: 'The Invite', score: 0 } })).rejects.toThrow('archive down');
  expect(mocks.create).not.toHaveBeenCalled();
});

it('persists the run before writing and keeps the response and specific evidence gap under the same ID', async () => {
  const missingEvidence = ['Der mangler dokumentation for filmens afslutning.'];
  const raw = JSON.stringify({ ...JSON.parse(rawArticle()), status: 'insufficient_evidence', missingEvidence });
  mocks.create.mockReset().mockResolvedValueOnce({ ...response(raw), usage: { prompt_tokens: 100, completion_tokens: 80 } });
  await expect(generateLivArticle({ topic: { title: 'The Invite', score: 0 }, articleFormat: 'research-review', sourceScope: 'editor-a' }))
    .rejects.toMatchObject({ code: 'article_evidence_insufficient', missingEvidence,
      blockedReview: { kind: 'research', text: expect.stringContaining(missingEvidence[0]) } });
  expect(mocks.rememberBrief).toHaveBeenCalledTimes(3);
  const initial = mocks.rememberBrief.mock.calls[0][2];
  expect(initial).toMatchObject({ runId: expect.stringMatching(/^[a-f0-9-]{36}$/), sources: expect.arrayContaining([
    expect.objectContaining({ url: primaryUrl, contentHash: 'hash' }),
  ]) });
  expect(mocks.rememberBrief.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
  expect(mocks.rememberBrief.mock.calls.map(call => call[2].runId)).toEqual([initial.runId, initial.runId, initial.runId]);
  expect(mocks.rememberBrief.mock.calls[1][2]).toMatchObject({ rawResponse: raw, tokenUsage: { input: 100, output: 80 } });
  expect(mocks.rememberBrief.mock.calls[2][2]).toMatchObject({ missingEvidence });
  expect(mocks.seo).not.toHaveBeenCalled();
});

it('does not spend a writer call if the research diagnostic cannot be persisted', async () => {
  mocks.rememberBrief.mockRejectedValueOnce(new Error('diagnostic archive down'));
  await expect(generateLivArticle({ topic: { title: 'The Invite', score: 0 } })).rejects.toThrow('diagnostic archive down');
  expect(mocks.create).not.toHaveBeenCalled();
});

it('rejects an incomplete model response', async () => {
  mocks.create.mockReset().mockResolvedValueOnce({ choices: [{ message: { content: rawArticle() }, finish_reason: 'length' }] });
  await expect(generateLivArticle({ topic: { title: 'The Invite', score: 0 }, articleFormat: 'research-review' })).rejects.toThrow('article_generation_incomplete');
});

it('blocks copied passages even when the similarity service says pass', async () => {
  const copied = 'Denne lange og helt særlige formulering fra et andet medie skal aldrig genbruges i Livs artikel.';
  mocks.retrieve.mockImplementation(async (url: string, id: string) => ({ id, url, title: 'The Invite', text: `${copied} ${'research '.repeat(80)}`, contentHash: 'hash', retrievedAt: '2026-09-09T18:00:00Z', publishedAt: null }));
  mocks.create.mockReset().mockResolvedValueOnce(response(rawArticle(true, `${body}\n\n${copied}`)));
  await expect(generateLivArticle({ topic: { title: 'The Invite', score: 0 }, articleFormat: 'research-review' })).rejects.toThrow('source_copy_detected');
});

it.each(['article_generation_refused', 'article_evidence_insufficient'])('does not send a declined article to SEO or similarity: %s', async code => {
  const result = code === 'article_generation_refused'
    ? { choices: [{ finish_reason: 'stop', message: { refusal: 'Declined', content: null } }] }
    : response(JSON.stringify({ ...JSON.parse(rawArticle()), status: 'insufficient_evidence', rating: null, ratingReason: null }));
  mocks.create.mockReset().mockResolvedValueOnce(result);
  await expect(generateLivArticle({ topic: { title: 'The Invite', score: 0 }, articleFormat: 'research-review' })).rejects.toThrow(code);
  expect(mocks.seo).not.toHaveBeenCalled();
  expect(mocks.similarity).not.toHaveBeenCalled();
});

it.each([true, false])('stops with diagnosable source failure, complete=%s', async complete => {
  mocks.similarity.mockResolvedValueOnce({ pass: false, complete,
    scores: { embeddingSim: 0.9, ngramJaccard: 0.1, openingSim: 0.1 } });
  await expect(generateLivArticle({ topic: { title: 'The Invite', score: 0 }, articleFormat: 'research-review' }))
    .rejects.toMatchObject({ name: 'SourceSimilarityError', status: complete ? 422 : 503,
      code: complete ? 'source_similarity_unapproved' : 'source_similarity_incomplete',
      detail: expect.objectContaining({ complete, sourceHash: 'hash' }) });
});
