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
