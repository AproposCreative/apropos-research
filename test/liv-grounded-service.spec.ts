import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn() }));
vi.mock('@/lib/openai', () => ({ models: { default: 'test-model' }, getOpenAIClient: () => ({ chat: { completions: { create: mocks.create } } }) }));
vi.mock('@/lib/factcheck/source-reader', async original => ({ ...await original<typeof import('@/lib/factcheck/source-reader')>(), retrieveSource: mocks.retrieve }));
import { verifyArticleSources } from '@/lib/factcheck/verify-article';
import { articleUnits, groundedResponseFormat, isCompleteGroundedReport } from '@/lib/factcheck/grounded';

const text = 'Koncerten afholdes den 5. november 2026 i København.';
const urls = ['https://primary.example/news', 'https://secondary.example/news'];
const assessment = { units: [{ id: 'u1', opinionOnly: false, claims: [{ claim: text, status: 'verified', explanation: 'Begge kilder oplyser samme dato og sted.', citations: [{ sourceId: 's1', quote: text }, { sourceId: 's2', quote: text }] }] }] };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.retrieve.mockImplementation(async (url: string, id: string) => ({ id, url, title: 'Koncert', text: text.repeat(8), contentHash: 'a'.repeat(64), publishedAt: '2026-09-09T10:00:00Z', retrievedAt: new Date().toISOString() }));
  mocks.create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(assessment) } }] });
});
it('requests the strict assessment schema and checks the complete exact text', async () => {
  const report = await verifyArticleSources(text, urls);
  expect(isCompleteGroundedReport(report, text)).toBe(true);
  expect(mocks.create.mock.calls[0][0].response_format).toEqual(groundedResponseFormat);
  expect(groundedResponseFormat.json_schema.strict).toBe(true);
  expect(groundedResponseFormat.json_schema.schema.additionalProperties).toBe(false);
  expect(JSON.parse(mocks.create.mock.calls[0][0].messages[1].content).units).toEqual(articleUnits(text));
});
it('identifies missing dates without calling the model or claiming invalid model output', async () => {
  mocks.retrieve.mockResolvedValue({ id: 's1', url: urls[0], title: 'Undated', text, contentHash: 'a'.repeat(64), publishedAt: null, retrievedAt: new Date().toISOString() });
  const report = await verifyArticleSources(text, urls);
  expect(report.complete).toBe(false);
  expect(report.diagnostic?.code).toBe('insufficient_dated_sources');
  expect(report.blockers.join(' ')).not.toContain('Ugyldigt svar');
  expect(mocks.create).not.toHaveBeenCalled();
});
it('requires two dated hosts, not two pages from the same host', async () => {
  const report = await verifyArticleSources(text, [urls[0], urls[0] + '/second']);
  expect(report.diagnostic?.code).toBe('insufficient_dated_sources');
  expect(mocks.create).not.toHaveBeenCalled();
});
it('instructs the verifier to cite exact dated evidence while retaining undated context and conflicts', async () => {
  const undatedUrl = 'https://context.example/film';
  mocks.retrieve.mockImplementation(async (url: string, id: string) => ({ id, url, title: 'Koncert', text: text.repeat(8),
    contentHash: 'a'.repeat(64), publishedAt: url === undatedUrl ? null : '2026-09-09T10:00:00Z', retrievedAt: new Date().toISOString() }));
  const report = await verifyArticleSources(text, [...urls, undatedUrl]);
  const request = mocks.create.mock.calls[0][0];
  const prompt = request.messages[0].content;
  expect(prompt).toContain('Vælg citations fra kilder med kendt publishedAt');
  expect(prompt).toContain('bruge dens sourceId og ordrette citat frem for en udateret side');
  expect(prompt).toContain('publishedAt=null er kun kontekst og kan aldrig opfylde kravet til belæg for verified');
  expect(prompt).toContain('inklusive udaterede sider; ignorer ikke konflikter');
  expect(prompt).toContain('Ved konflikt: disputed');
  expect(JSON.parse(request.messages[1].content).sources).toContainEqual(expect.objectContaining({ url: undatedUrl, publishedAt: null }));
  expect(report.complete).toBe(true); // This fixture cites only the two dated sources.
  expect(isCompleteGroundedReport(report, text)).toBe(true);
});
it('still rejects an undated citation even when other dated sources support the same claim', async () => {
  mocks.retrieve.mockImplementation(async (url: string, id: string) => ({ id, url, title: 'Koncert', text: text.repeat(8),
    contentHash: 'a'.repeat(64), publishedAt: id === 's3' ? null : '2026-09-09T10:00:00Z', retrievedAt: new Date().toISOString() }));
  const raw = structuredClone(assessment);
  raw.units[0].claims[0].citations.push({ sourceId: 's3', quote: text });
  mocks.create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] });
  const report = await verifyArticleSources(text, [...urls, 'https://context.example/film']);
  expect(report.complete).toBe(false);
  expect(report.results[0]).toMatchObject({ status: 'unverifiable', validationErrors: ['undated_source'] });
  expect(isCompleteGroundedReport(report, text)).toBe(false);
});
it('tells every unit request to use genuinely supporting exact evidence across dated hosts without padding or ignoring conflicts', async () => {
  const article = `${text}\n\n${text}`;
  mocks.create.mockImplementation(async request => {
    const input = JSON.parse(request.messages[1].content);
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      units: [{ ...assessment.units[0], id: input.requiredUnitId }],
    }) } }] };
  });
  const report = await verifyArticleSources(article, urls);
  expect(report.complete).toBe(true);
  expect(mocks.create).toHaveBeenCalledTimes(articleUnits(article).length);
  for (const [request] of mocks.create.mock.calls) {
    const prompt = request.messages[0].content;
    expect(prompt).toContain('mindst to forskellige daterede kildeværter (URL-hosts, ikke blot forskellige sider på samme host)');
    expect(prompt).toContain('ikke et krav om to værter for hver påstand eller hvert afsnit');
    expect(prompt).toContain('vælg ikke altid den første kilde eller s1');
    expect(prompt).toContain('NÅR deres hentede tekster faktisk understøtter de konkrete påstande og deres tidslige kontekst');
    expect(prompt).toContain('begge værters ordrette belæg med deres korrekte sourceId');
    expect(prompt).toContain('Tilføj aldrig irrelevante eller omtrentlige citater som fyld');
    expect(prompt).toContain('opfind ikke belæg, og ignorer aldrig modstridende oplysninger');
    expect(prompt).toContain('lad kravet om to værter være uopfyldt');
    expect(prompt).toContain('Ved konflikt: disputed');
    expect(JSON.parse(request.messages[1].content).sources.map(source => source.url)).toEqual(urls);
  }
});
it('keeps the two-host gate closed when all verified claims still cite only the first host, without a model retry', async () => {
  const raw = structuredClone(assessment);
  raw.units[0].claims[0].citations = [raw.units[0].claims[0].citations[0]];
  mocks.create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] });
  const report = await verifyArticleSources(text, urls);
  expect(report.results.every(result => result.status === 'verified')).toBe(true);
  expect(report.coverage.checkedUnits).toBe(report.coverage.expectedUnits);
  expect(report.complete).toBe(false);
  expect(report.blockers).toContain('Der kræves belæg fra mindst to kildeværter.');
  expect(isCompleteGroundedReport(report, text)).toBe(false);
  expect(mocks.create).toHaveBeenCalledTimes(1);
});
it.each([
  ['length', JSON.stringify(assessment), 'model_response_incomplete'],
  ['stop', '{', 'model_response_invalid_json'],
  ['stop', '{}', 'model_response_invalid_schema'],
])('fails closed with a specific diagnostic: %s / %s', async (finish_reason, content, code) => {
  mocks.create.mockResolvedValue({ choices: [{ finish_reason, message: { content } }] });
  const report = await verifyArticleSources(text, urls);
  expect(report.complete).toBe(false);
  expect(report.diagnostic?.code).toBe(code);
  expect(isCompleteGroundedReport(report, text)).toBe(false);
});
it('does not turn disputed evidence into a transport/format failure', async () => {
  const raw = structuredClone(assessment);
  raw.units[0].claims[0].status = 'disputed';
  mocks.create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] });
  const report = await verifyArticleSources(text, urls);
  expect(report.complete).toBe(false);
  expect(report.diagnostic).toBeUndefined();
  expect(report.results[0].status).toBe('disputed');
});
