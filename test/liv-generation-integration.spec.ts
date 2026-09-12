import { beforeEach, expect, it, vi } from 'vitest';
import { generateLivArticle, collectImageSuggestions } from '@/lib/liv/generate-article';
import { loadLivVoice } from '@/lib/liv/voice';
import { buildLivCmsPayload } from '@/lib/liv/build-cms-payload';
import { normalizeArticlePayload } from '@/lib/articles/article-payload';

const mocks = vi.hoisted(() => ({ feedback: vi.fn(), resume: vi.fn(), create: vi.fn(), search: vi.fn(), retrieve: vi.fn(), remember: vi.fn(), rememberBrief: vi.fn(), recall: vi.fn(), seo: vi.fn(), similarity: vi.fn(), images: vi.fn() }));
vi.mock('@/lib/liv/editorial-feedback', () => ({ loadLivEditorialFeedbackPrompt: mocks.feedback }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: mocks.create } } }) }));
vi.mock('@/lib/research/service', () => ({ getResearch: mocks.search }));
vi.mock('@/lib/liv/source-archive', () => ({ loadRecoverableWritingBrief: mocks.resume, rememberResearchSources: mocks.remember, rememberWritingBrief: mocks.rememberBrief, recalledSourceUrls: mocks.recall }));
vi.mock('@/lib/factcheck/source-reader', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/factcheck/source-reader')>(), retrieveSource: mocks.retrieve }));
vi.mock('@/lib/liv/fetch-official-images', () => ({ fetchOfficialImagesFromPage: mocks.images }));
vi.mock('@/lib/seo/generate-seo-meta', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/seo/generate-seo-meta')>(), generateSeoMetaAI: mocks.seo,
}));
vi.mock('@/lib/liv/source-similarity', () => ({ checkSourceSimilarity: mocks.similarity }));
// Evidence-note extraction is validated separately, including invented quotes and source IDs.
vi.mock('@/lib/liv/writing-brief', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/liv/writing-brief')>(),
  buildLivWritingBrief: async () => ({ writerText: '[S1] Olivia Wilde instruerer The Invite. Seth Rogen medvirker.', notes: [] }),
}));

const primaryUrl = 'https://a24films.com/films/the-invite';
const criticUrl = 'https://example.com/criticism/the-invite';
const reason = 'Præmissens præcise konflikt vejer tungt i dommen, selv om indvendingerne også skal med.';
const body = 'Olivia Wilde sætter The Invite omkring en middag. Det konkrete sammenstød giver stof til en dom, ikke blot et handlingsreferat.';
const rewrittenBody = 'Gæstfrihed har en pris i The Invite. Middagens magtforhold giver Olivia Wildes film en konkret konflikt at undersøge.';
const response = (raw: string) => ({ model: 'gpt-5.6-sol-test-snapshot', choices: [{ message: { content: raw }, finish_reason: 'stop' }] });
const rawArticle = (rated = true, content = body) => JSON.stringify({ status: 'ready',
  title: 'The Invite: Middagen som magtkamp', subtitle: 'En selvstændig dom med plads til tvivl',
  intro: 'Høflighed kan være et krævende stykke arbejde.', content,
  rating: rated ? 4 : null, ratingReason: rated ? reason : null });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.feedback.mockReset().mockResolvedValue('');
  mocks.images.mockReset().mockResolvedValue([]);
  mocks.resume.mockReset();
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

it('keeps official gallery candidates ahead of unrelated news thumbnails and deduplicates source pages', async () => {
  mocks.images.mockImplementation(async (page: string) => Array.from({ length: 6 }, (_, i) => `${page}/image-${i}.jpg`));
  const result = await collectImageSuggestions({ topic: { title: 'The Invite', score: 0 }, researchResults: [
    ...Array.from({ length: 5 }, (_, i) => ({ title: 'News', source: 'News', content: 'News', url: `https://news.example.com/${i}` })),
    { title: 'Official', source: 'A24', content: 'Film', url: primaryUrl },
    { title: 'Official duplicate', source: 'A24', content: 'Film', url: primaryUrl },
  ] });
  expect(result).toHaveLength(12);
  expect(result.slice(0, 6).every(image => image.sourcePageUrl === primaryUrl)).toBe(true);
  expect(mocks.images.mock.calls.filter(call => call[0] === primaryUrl)).toHaveLength(1);
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
  expect(request.messages[0].content).toContain('separat kildebaseret faktakontrol før CMS og udgivelse');
  expect(request.messages[0].content).toContain('Afvis stadig ved konkrete mangler eller modstridende oplysninger');
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
  expect(payload.aiGenerated).toBe(false);
  expect(payload.aiModel).toBe('gpt-5.6-sol-test-snapshot');
  expect(payload.content).toBe(body);
  expect(payload.intro).not.toContain('Researchbaseret analyse');
});

it('stops before generation when the source archive fails', async () => {
  mocks.remember.mockRejectedValueOnce(new Error('archive down'));
  await expect(generateLivArticle({ topic: { title: 'The Invite', score: 0 } })).rejects.toThrow('archive down');
  expect(mocks.create).not.toHaveBeenCalled();
});

it('preparation re-fetches sufficient dated saved research without buying discovery or SEO', async () => {
  mocks.recall.mockResolvedValueOnce([primaryUrl, criticUrl]);
  mocks.retrieve.mockImplementationOnce(async (url: string, id: string) => ({ id, url, title: 'Official',
    text: 'Olivia Wilde. The Invite. Seth Rogen. '.repeat(12), contentHash: 'primary-hash',
    publishedAt: '2026-09-09T10:00:00Z', retrievedAt: new Date().toISOString() }))
    .mockImplementationOnce(async (url: string, id: string) => ({ id, url, title: 'Critic',
      text: 'Olivia Wilde. The Invite. Seth Rogen. '.repeat(12), contentHash: 'critic-hash',
      publishedAt: '2026-09-09T10:00:00Z', retrievedAt: new Date().toISOString() }));
  const article = await generateLivArticle({ topic: { title: 'The Invite', score: 0 },
    articleFormat: 'research-review', preparation: true });
  expect(mocks.search).not.toHaveBeenCalled();
  expect(mocks.retrieve).toHaveBeenCalledTimes(2);
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.seo).not.toHaveBeenCalled();
  expect(article.researchSources?.map(source => source.contentHash)).toEqual(['primary-hash', 'critic-hash']);
});

it('preparation still searches when saved sources lack actual dates', async () => {
  mocks.recall.mockResolvedValueOnce([primaryUrl, criticUrl]);
  await generateLivArticle({ topic: { title: 'The Invite', score: 0 }, articleFormat: 'research-review', preparation: true });
  expect(mocks.search).toHaveBeenCalledTimes(1);
  expect(mocks.search.mock.calls[0][0]).toContain('official source');
  expect(mocks.search.mock.calls[0][0]).toContain('independent review');
  expect(mocks.search.mock.calls[0][1]).toMatchObject({ maxResults: 5, timeoutMs: 30_000, model: 'gpt-5.6-luna', allowFallback: false });
});

it('uses saved editorial preferences only for new daily writing', async () => {
  mocks.feedback.mockResolvedValueOnce('Private bounded preference: shorter paragraphs.');
  await generateLivArticle({ topic: { title: 'The Invite', score: 0 }, articleFormat: 'research-review', preparation: true });
  expect(mocks.feedback).toHaveBeenCalledTimes(1);
  expect(mocks.create.mock.calls[0][0].messages[0].content).toContain('Private bounded preference: shorter paragraphs.');
  expect(mocks.create).toHaveBeenCalledTimes(1);
});

it('keeps explicit film classification through generation and CMS normalization without inventing review stars', async () => {
  mocks.create.mockReset().mockResolvedValueOnce(response(JSON.stringify({ ...JSON.parse(rawArticle(false)), subjectType: 'film' })));
  const topic = { title: 'The Invite', score: 0 };
  const article = await generateLivArticle({ topic, preparation: true });
  expect(article).toMatchObject({ subjectType: 'film', articleFormat: 'article' });
  expect(mocks.create.mock.calls[0][0].messages[0].content).toContain('450–650 ord');
  const payload = normalizeArticlePayload(buildLivCmsPayload({ article, topic }));
  expect(payload).toMatchObject({ subjectType: 'film', articleFormat: 'article', aiGenerated: false });
  expect(payload.rating).toBeUndefined();
});

it('does not buy research or writing when feedback storage is unavailable', async () => {
  mocks.feedback.mockRejectedValueOnce(new Error('liv_editorial_feedback_store_unavailable'));
  await expect(generateLivArticle({ topic: { title: 'The Invite', score: 0 }, preparation: true }))
    .rejects.toThrow('liv_editorial_feedback_store_unavailable');
  expect(mocks.search).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it.each([true, false])('preparation retains the initial draft and never buys a full rewrite after similarity failure, complete=%s', async complete => {
  mocks.similarity.mockResolvedValueOnce({ pass: false, complete,
    scores: { embeddingSim: 0.9, ngramJaccard: 0.1, openingSim: 0.1 } });
  await expect(generateLivArticle({ topic: { title: 'The Invite', score: 0 }, articleFormat: 'research-review', preparation: true }))
    .rejects.toMatchObject({ name: 'SourceSimilarityError', status: complete ? 422 : 503,
      blockedReview: { text: expect.stringContaining(body) } });
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.rememberBrief).toHaveBeenLastCalledWith('liv-daily', 'The Invite', expect.objectContaining({ rawResponse: rawArticle() }));
});

it('preparation blocks copied prose without spending on a full rewrite', async () => {
  const copied = 'Denne lange og helt særlige formulering fra et andet medie skal aldrig genbruges i Livs artikel.';
  mocks.retrieve.mockImplementation(async (url: string, id: string) => ({ id, url, title: 'Research',
    text: `${copied} ${'research '.repeat(80)}`, contentHash: 'hash', retrievedAt: new Date().toISOString(), publishedAt: null }));
  mocks.create.mockReset().mockResolvedValueOnce(response(rawArticle(true, `${body}\n\n${copied}`)));
  await expect(generateLivArticle({ topic: { title: 'The Invite', score: 0 }, articleFormat: 'research-review', preparation: true }))
    .rejects.toThrow('source_copy_detected');
  expect(mocks.create).toHaveBeenCalledTimes(1);
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
  mocks.create.mockReset().mockResolvedValueOnce(response(rawArticle(true, `${body}\n\n${copied}`)))
    .mockResolvedValueOnce(response(rawArticle(true, `${rewrittenBody}\n\n${copied}`)));
  await expect(generateLivArticle({ topic: { title: 'The Invite', score: 0 }, articleFormat: 'research-review' })).rejects.toThrow('source_copy_detected');
  const feedback = JSON.parse(mocks.create.mock.calls[1][0].messages[1].content);
  expect(feedback.forbiddenSourcePhrases).toEqual(['denne lange og helt særlige formulering fra et andet medie skal aldrig']);
});

it('resumes paid text through source re-fetch and all checks without repeating research or the initial writer', async () => {
  const runId = '4f5f2284-420d-4622-ac68-b42c0bc18ffd';
  const original = rawArticle();
  mocks.resume.mockResolvedValue({ rawResponse: original, writerText: '[S1] Saved evidence notes',
    model: 'saved-writer', voiceVersion: 'liv-v4', sources: [{ url: primaryUrl }, { url: criticUrl }] });
  mocks.create.mockReset().mockResolvedValueOnce(response(rawArticle(true, rewrittenBody)));
  mocks.similarity.mockResolvedValueOnce({ pass: false, complete: true });
  const article = await generateLivArticle({ topic: { title: 'The Invite', score: 0 }, articleFormat: 'research-review', resumeWritingRunId: runId });
  expect(mocks.resume).toHaveBeenCalledWith('liv-daily', 'The Invite', runId);
  expect(mocks.search).not.toHaveBeenCalled();
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.retrieve).toHaveBeenCalledTimes(2);
  expect(article.rawResponse).toBe(rawArticle(true, rewrittenBody));
  expect(mocks.rememberBrief).toHaveBeenCalledTimes(1);
  expect(mocks.rememberBrief.mock.calls[0][2]).toMatchObject({ parentRunId: runId, rawResponse: article.rawResponse });
  expect(mocks.rememberBrief.mock.calls[0][2].runId).not.toBe(runId);
  expect(mocks.similarity).toHaveBeenCalledTimes(3);
});

it('fails closed on a missing or mismatched archived draft instead of generating again', async () => {
  mocks.resume.mockRejectedValue(new Error('writing_resume_mismatch'));
  await expect(generateLivArticle({ topic: { title: 'The Invite', score: 0 }, resumeWritingRunId: '4f5f2284-420d-4622-ac68-b42c0bc18ffd' }))
    .rejects.toThrow('writing_resume_mismatch');
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.search).not.toHaveBeenCalled();
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

it.each([true, false])('stops with diagnosable source failure after one originality rewrite, complete=%s', async complete => {
  // The generator permits one rewrite, then requires a fresh passing comparison.
  mocks.create.mockResolvedValueOnce(response(rawArticle(true, rewrittenBody)));
  mocks.similarity.mockResolvedValue({ pass: false, complete,
    scores: { embeddingSim: 0.9, ngramJaccard: 0.1, openingSim: 0.1 } });
  await expect(generateLivArticle({ topic: { title: 'The Invite', score: 0 }, articleFormat: 'research-review' }))
    .rejects.toMatchObject({ name: 'SourceSimilarityError', status: complete ? 422 : 503,
      code: complete ? 'source_similarity_unapproved' : 'source_similarity_incomplete',
      detail: expect.objectContaining({ complete, sourceHash: 'hash' }),
      blockedReview: { status: 'blocked', text: expect.stringContaining(rewrittenBody) } });
  expect(mocks.create).toHaveBeenCalledTimes(2);
  expect(mocks.similarity).toHaveBeenCalledTimes(2);
  expect(mocks.similarity.mock.calls[1][0].generated).toContain(rewrittenBody);
  expect(mocks.images).not.toHaveBeenCalled();
});

it('accepts an originality rewrite only after checking it against every research source', async () => {
  mocks.create.mockResolvedValueOnce(response(rawArticle(true, rewrittenBody)));
  mocks.similarity.mockResolvedValueOnce({ pass: false, complete: true,
    scores: { embeddingSim: 0.9, ngramJaccard: 0.1, openingSim: 0.1 } });
  const article = await generateLivArticle({ topic: { title: 'The Invite', score: 0 }, articleFormat: 'research-review' });
  expect(article.content).toBe(rewrittenBody);
  expect(article.researchSources).toHaveLength(2);
  expect(mocks.create).toHaveBeenCalledTimes(2);
  const rewriteRequest = JSON.parse(mocks.create.mock.calls[1][0].messages[1].content);
  expect(rewriteRequest).toMatchObject({ draftToRewrite: { content: body }, blockedSourceHost: 'a24films.com' });
  expect(mocks.similarity).toHaveBeenCalledTimes(3);
  expect(mocks.similarity.mock.calls.slice(1).every(call => call[0].generated.includes(rewrittenBody))).toBe(true);
});
