import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSafetyGates } from '@/lib/liv/run-safety-gates';
import { checkSourceSimilarity } from '@/lib/liv/source-similarity';
import { articleFingerprint, assessGroundedReport } from '@/lib/factcheck/grounded';

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

  it('reports incomplete similarity as unavailable, not as excessive similarity', async () => {
    vi.mocked(checkSourceSimilarity).mockResolvedValueOnce({ pass: false, complete: false,
      failure: 'embedding-unavailable', scores: { embeddingSim: 0, ngramJaccard: 0, openingSim: 0 } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await runSafetyGates({ baseUrl: 'http://localhost:3000', title: 'The Invite',
      content: 'Artikel '.repeat(100), sourceExcerpt: 'En ekstern kilde. '.repeat(20), requireCompleteVerification: true });
    expect(result).toMatchObject({ pass: false, failedGate: 'source-similarity', anyGateSkipped: true });
    expect(result.results[0].detail).toContain('ikke en konstatering af plagiat');
    expect(fetchMock).not.toHaveBeenCalled();
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

  const diagnosticInput = {
    baseUrl: 'http://localhost:3000', title: 'Koncerten', additionalTexts: ['Undertitel', 'SEO'], intro: 'Introduktion.',
    content: 'Koncerten afholdes den 5. november 2026 i København.',
    sourceExcerpt: 'En separat og dokumenteret kilde med en anden formulering. '.repeat(4),
    requireCompleteVerification: true,
  };
  const diagnosticText = [diagnosticInput.title, ...diagnosticInput.additionalTexts, diagnosticInput.intro, diagnosticInput.content].join('\n\n');
  function report(status = 'verified', undated = false) {
    const sources = ['primary', 'secondary'].map((name, i) => ({ id: `s${i + 1}`, url: `https://${name}.example/news`,
      title: 'Koncert', text: diagnosticInput.content.repeat(8), contentHash: String(i + 1).repeat(64),
      retrievedAt: new Date().toISOString(), publishedAt: undated && i === 1 ? null : '2026-09-09T10:00:00Z' }));
    return assessGroundedReport(diagnosticText, sources, { units: [{ id: 'u1', opinionOnly: false, claims: [{
      claim: diagnosticInput.content, status, explanation: 'Begrundelse med konkret kildebelæg.',
      citations: sources.map(source => ({ sourceId: source.id, quote: diagnosticInput.content })),
    }] }] });
  }
  function respondWithFactcheck(value: unknown) {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { metrics: { wordCount: 700, plagiarismRisk: 'low' } } }))
      .mockResolvedValueOnce(jsonResponse(value))
      .mockResolvedValueOnce(jsonResponse({ data: { tips: 'Fin tekst.' } })));
  }

  it('reuses an exact fresh server report while still running similarity, moderation and voice gates', async () => {
    const saved = report();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { metrics: { wordCount: 700, plagiarismRisk: 'low' } } }))
      .mockResolvedValueOnce(jsonResponse({ data: { tips: 'Fin tekst.' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await runSafetyGates({ ...diagnosticInput, priorFactcheck: saved });
    expect(result.pass).toBe(true);
    expect(result.results.find(gate => gate.name === 'factcheck')).toMatchObject({ skipped: false, evidence: saved });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/factcheck'))).toBe(false);
    expect(result.results.map(gate => gate.name)).toEqual(['source-similarity', 'moderation', 'factcheck', 'tov']);
  });

  it.each(['stale', 'wrong-version', 'unverified', 'undated-citation'])('does not reuse %s saved evidence', async kind => {
    const saved = kind === 'undated-citation' ? report('verified', true) : report();
    if (kind === 'stale') saved.checkedAt = new Date(Date.now() - 16 * 60_000).toISOString();
    if (kind === 'wrong-version') saved.articleHash = articleFingerprint('Different text');
    if (kind === 'unverified') saved.results[0].status = 'unverifiable';
    respondWithFactcheck({ error: 'unavailable' });
    const result = await runSafetyGates({ ...diagnosticInput, priorFactcheck: saved });
    expect(result.pass).toBe(false);
    expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]).includes('/api/factcheck'))).toBe(true);
  });

  it('retains incomplete claims, validation errors and source metadata as diagnostics without approval', async () => {
    const failed = report('verified', true);
    respondWithFactcheck(failed);
    const result = await runSafetyGates(diagnosticInput);
    const gate = result.results.find(gate => gate.name === 'factcheck')!;
    expect(result).toMatchObject({ pass: false, failedGate: 'verification-complete', anyGateSkipped: true });
    expect(gate.diagnosticEvidence).toEqual(failed);
    expect(gate.diagnosticEvidence!.results[0]).toMatchObject({ status: 'unverifiable', validationErrors: ['undated_source'] });
    expect(gate).not.toHaveProperty('evidence');
  });

  it('retains disputed reports before the factcheck early return without approval', async () => {
    const disputed = report('disputed');
    respondWithFactcheck(disputed);
    const result = await runSafetyGates(diagnosticInput);
    expect(result).toMatchObject({ pass: false, failedGate: 'factcheck' });
    expect(result.results.find(gate => gate.name === 'factcheck')).toMatchObject({ pass: false, diagnosticEvidence: disputed });
    expect(result.results.find(gate => gate.name === 'factcheck')).not.toHaveProperty('evidence');
  });

  it('retains source/date failure diagnostics even when no claims could be checked', async () => {
    const incomplete = assessGroundedReport(diagnosticText, [], null, Date.now(), {
      code: 'insufficient_dated_sources', message: 'Mindst to daterede kildeværter kræves.',
    });
    respondWithFactcheck(incomplete);
    const result = await runSafetyGates(diagnosticInput);
    expect(result.pass).toBe(false);
    expect(result.results.find(gate => gate.name === 'factcheck')?.diagnosticEvidence).toEqual(incomplete);
  });

  it.each([
    { articleHash: articleFingerprint(diagnosticInput.content) },
    { verificationMethod: 'model-only' }, { checkedAt: 'invalid' }, { coverage: null },
    { blockers: 'failure' }, { sources: [{}] }, { results: [{ claim: 'Invalid', status: 'disputed' }] },
  ])('does not archive mismatched or malformed diagnostics: %j', async patch => {
    respondWithFactcheck({ ...report('verified', true), ...patch });
    const result = await runSafetyGates(diagnosticInput);
    expect(result.pass).toBe(false);
    const gate = result.results.find(gate => gate.name === 'factcheck')!;
    expect(gate).not.toHaveProperty('diagnosticEvidence');
    expect(gate).not.toHaveProperty('evidence');
  });

  it('does not retain unknown upstream fields or full source text in diagnostic records', async () => {
    const failed = report('verified', true);
    respondWithFactcheck({ ...failed, providerBody: 'private', sources: failed.sources.map(source => ({ ...source, text: 'full source body' })) });
    const result = await runSafetyGates(diagnosticInput);
    expect(result.results.find(gate => gate.name === 'factcheck')?.diagnosticEvidence).toEqual(failed);
  });

  it('keeps fully validated approval evidence separate from diagnostic evidence', async () => {
    const passed = report();
    respondWithFactcheck(passed);
    const result = await runSafetyGates(diagnosticInput);
    expect(result.pass).toBe(true);
    const gate = result.results.find(gate => gate.name === 'factcheck')!;
    expect(gate.evidence).toEqual(passed);
    expect(gate).not.toHaveProperty('diagnosticEvidence');
  });
});
