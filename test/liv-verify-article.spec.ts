import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ client: vi.fn(), create: vi.fn(), retrieve: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: mocks.client, models: { default: 'test-model' } }));
vi.mock('@/lib/factcheck/source-reader', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/factcheck/source-reader')>()), retrieveSource: mocks.retrieve }));
import { verifyArticleSources } from '@/lib/factcheck/verify-article';

const claim = 'Museet åbnede den 8. september 2026.';
const urls = ['https://museum.dk/a', 'https://kultur.dk/b'];
const assessment = { units: [{ id: 'u1', opinionOnly: false, claims: [{ claim, status: 'verified', explanation: 'Datoen fremgår af kilderne.', citations: [{ sourceId: 's1', quote: claim }, { sourceId: 's2', quote: claim }] }] }] };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockReturnValue({ chat: { completions: { create: mocks.create } } });
  mocks.retrieve.mockImplementation(async (url, id) => ({ id, url, title: 'Kilde', text: claim, contentHash: 'a'.repeat(64), publishedAt: '2026-09-08T10:00:00Z', retrievedAt: new Date().toISOString() }));
  mocks.create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(assessment) } }] });
});
it('uses fetched source text, deduplicates URLs and returns evidence', async () => {
  const report = await verifyArticleSources(claim, [...urls, urls[0]]);
  expect(report.complete).toBe(true);
  expect(mocks.retrieve).toHaveBeenCalledTimes(2);
  const [body, options] = mocks.create.mock.calls[0];
  expect(body.reasoning_effort).toBe('low');
  expect(JSON.parse(body.messages[1].content).sources[0].text).toBe(claim);
  expect(options.maxRetries).toBe(0);
  expect(options.timeout).toBe(90000);
});
it('does not use model knowledge when source retrieval fails', async () => {
  mocks.retrieve.mockRejectedValue(new Error('blocked'));
  expect((await verifyArticleSources(claim, urls)).complete).toBe(false);
  expect(mocks.create).not.toHaveBeenCalled();
});
it('does not call a model when no key is configured', async () => {
  mocks.client.mockReturnValue(null);
  await expect(verifyArticleSources(claim, urls)).rejects.toThrow('ikke konfigureret');
  expect(mocks.retrieve).not.toHaveBeenCalled();
});
it.each(['length', 'content_filter'])('rejects incomplete model output: %s', finish_reason => {
  mocks.create.mockResolvedValue({ choices: [{ finish_reason, message: { content: JSON.stringify(assessment) } }] });
  return expect(verifyArticleSources(claim, urls)).resolves.toMatchObject({ complete: false });
});
it('rejects malformed model JSON', async () => {
  mocks.create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: '{' } }] });
  expect((await verifyArticleSources(claim, urls)).complete).toBe(false);
});
it('retries a provider 500 once, without weakening evidence checks', async () => {
  mocks.create.mockRejectedValueOnce(Object.assign(new Error('provider unavailable'),{status:500}));
  expect((await verifyArticleSources(claim,urls)).complete).toBe(true);
  expect(mocks.create).toHaveBeenCalledTimes(2);
});
it.each([401,403,429])('does not retry auth, access or quota responses: %s', async status => {
  mocks.create.mockRejectedValue(Object.assign(new Error('provider rejection'),{status}));
  await expect(verifyArticleSources(claim,urls)).rejects.toThrow('provider rejection');
  expect(mocks.create).toHaveBeenCalledTimes(1);
});
it('reviews every mixed-text unit separately without accepting omitted units', async () => {
  const text = `${claim} ${'Dette er min vurdering. '.repeat(170)}`;
  mocks.create.mockImplementation(async (body) => {
    const { units } = JSON.parse(body.messages[1].content);
    expect(units).toHaveLength(1);
    expect(body.messages[0].content).toContain('I blandede afsnit');
    const unit = units[0];
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ units: [{
      id: unit.id, opinionOnly: !unit.text.includes(claim),
      claims: unit.text.includes(claim) ? assessment.units[0].claims : [],
    }] }) } }] };
  });
  const report = await verifyArticleSources(text, urls);
  expect(report.complete).toBe(true);
  expect(report.coverage.checkedUnits).toBe(report.coverage.expectedUnits);
  expect(mocks.create.mock.calls.length).toBeGreaterThan(1);
});
