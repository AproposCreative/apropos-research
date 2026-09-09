import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSafetyGates } from '@/lib/liv/run-safety-gates';

vi.mock('@/lib/liv/source-similarity', () => ({
  checkSourceSimilarity: vi.fn(async () => ({ pass: true, complete: true, scores: { embeddingSim: 0, ngramJaccard: 0, openingSim: 0 } })),
}));

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Liv safety gates', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('blocks auto-publish when factcheck is skipped', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { metrics: { wordCount: 700, plagiarismRisk: 'low' } } }))
      .mockResolvedValueOnce(jsonResponse({ error: 'temporarily unavailable' }, 503))
      .mockResolvedValueOnce(jsonResponse({ data: { tips: 'Fin tekst.' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runSafetyGates({
      baseUrl: 'http://localhost:3000',
      title: 'En testartikel',
      content: 'x '.repeat(700),
      sourceExcerpt: 'En separat og dokumenteret kilde med en anden formulering. '.repeat(4),
      requireCompleteVerification: true,
    });

    expect(result.pass).toBe(false);
    expect(result.failedGate).toBe('verification-complete');
    expect(result.anyGateSkipped).toBe(true);
  });

  it('blocks auto-publish when a model labels facts verified without source retrieval', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { metrics: { wordCount: 700, plagiarismRisk: 'low' } } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, results: [{ claim: 'Fakta', status: 'verified' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: { tips: 'Fin tekst.' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runSafetyGates({
      baseUrl: 'http://localhost:3000',
      title: 'En testartikel',
      content: 'x '.repeat(700),
      sourceExcerpt: 'En separat og dokumenteret kilde med en anden formulering. '.repeat(4),
      requireCompleteVerification: true,
    });

    expect(result.pass).toBe(false);
    expect(result.anyGateSkipped).toBe(true);
  });

  it('sends title, metadata and the full article without the old 6000-character cutoff', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { metrics: { wordCount: 1800, plagiarismRisk: 'low' } } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, verificationMethod: 'retrieved-sources', results: [{ status: 'verified' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: { tips: 'Fin tekst.' } }));
    vi.stubGlobal('fetch', fetchMock);
    const content = `${'Lang artikel. '.repeat(800)}SIDSTE FAKTUELLE PÅSTAND`;
    const result = await runSafetyGates({ baseUrl: 'http://localhost:3000', title: 'Titlen', content,
      additionalTexts: ['Undertitel', 'SEO-beskrivelse'], sourceUrls: ['https://museum.dk/kilde'],
      requireCompleteVerification: true });
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.articleText).toContain('Titlen\n\nUndertitel\n\nSEO-beskrivelse');
    expect(body.articleText).toContain('SIDSTE FAKTUELLE PÅSTAND');
    expect(body.sourceUrls).toEqual(['https://museum.dk/kilde']);
    expect(result.pass).toBe(false); // A method flag alone is not a verified report.
  });
});
