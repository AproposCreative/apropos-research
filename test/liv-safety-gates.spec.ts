import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSafetyGates } from '@/lib/liv/run-safety-gates';
import { checkSourceSimilarity } from '@/lib/liv/source-similarity';
import { articleFingerprint, assessGroundedReport } from '@/lib/factcheck/grounded';
import { loadLivVoice } from '@/lib/liv/voice';
import { livEditorialFieldContext } from '@/lib/liv/editorial-assessment-contract';

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
    sourceUrls: ['https://primary.example/news', 'https://secondary.example/news'],
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

  function editorialProof() {
    return { version: 'liv-editorial-v1' as const, articleHash: articleFingerprint(diagnosticText),
      voiceHash: loadLivVoice().hash, checkedAt: new Date().toISOString(), assessmentId: 'a'.repeat(64),
      verdict: 'approve' as const, summary: 'Selvstændig vinkel, korrekt tilskrivning og passende Liv-stemme.',
      blockingIssues: [] as Array<{ kind: string; articleQuote: string; explanation: string }>,
      checks: { voice: true, independentAngle: true, sourceAttribution: true, noInventedExperience: true, coherence: true } };
  }

  it('reuses an exact fresh server report while still running similarity, moderation and voice gates', async () => {
    const saved = { ...report(), editorialReview: editorialProof() };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { metrics: { wordCount: 700, plagiarismRisk: 'low' } } }))
      .mockResolvedValueOnce(jsonResponse({ data: { tips: 'Fin tekst.' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await runSafetyGates({ ...diagnosticInput, priorFactcheck: saved });
    expect(result.pass).toBe(true);
    expect(result.results.find(gate => gate.name === 'factcheck')).toMatchObject({ skipped: false, evidence: saved });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/factcheck'))).toBe(false);
    expect(result.results.map(gate => gate.name)).toEqual(['source-similarity', 'moderation', 'factcheck', 'tov']);
  });

  it.each(['stale', 'wrong-version', 'unverified'])('does not reuse %s saved evidence', async kind => {
    const saved = report();
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
    expect(gate.diagnosticEvidence!.results[0].status).toBe('verified');
    expect(gate.diagnosticEvidence!.blockers).toContain('Der kræves belæg fra mindst to kildeværter.');
    expect(gate).not.toHaveProperty('evidence');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]).includes('/api/critic/tov'))).toBe(false);
  });

  it('reuses an exact fresh failed report without buying the same factcheck or a voice review', async () => {
    const failed = report('unverifiable');
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: { metrics: { wordCount: 700, plagiarismRisk: 'low' } } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await runSafetyGates({ ...diagnosticInput, priorFactcheck: failed,
      sourceUrls: failed.sources.map(source => source.url) });
    expect(result).toMatchObject({ pass: false, failedGate: 'verification-complete' });
    expect(result.results.find(gate => gate.name === 'factcheck')?.diagnosticEvidence).toEqual(failed);
    expect(result.results.find(gate => gate.name === 'factcheck')).not.toHaveProperty('evidence');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  const editorialFields = { title: diagnosticInput.title, subtitle: 'Undertitel', seoDescription: 'SEO',
    intro: diagnosticInput.intro, content: diagnosticInput.content };
  const fieldContextHash = livEditorialFieldContext(diagnosticText, editorialFields).hash;
  it.each([undefined, 'retrieved-sources-v1'])('rechecks failed reports under policy %s without modifying saved evidence', async policyVersion => {
    const old = { ...report('unverifiable'), policyVersion, fieldContextHash };
    old.results[0].validationErrors = ['undated_source'];
    const before = structuredClone(old);
    respondWithFactcheck({ ...report(), editorialReview: editorialProof(), fieldContextHash });
    const result = await runSafetyGates({ ...diagnosticInput, editorialFields, priorFactcheck: old });
    expect(result.pass).toBe(true);
    expect(old).toEqual(before);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]).includes('/api/factcheck'))).toBe(true);
  });
  it.each([undefined, 'retrieved-sources-v1'])('keeps successful stricter-policy %s reports reusable', async policyVersion => {
    const saved = { ...report(), policyVersion, editorialReview: editorialProof(), fieldContextHash };
    const before = structuredClone(saved);
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: { metrics: { wordCount: 700, plagiarismRisk: 'low' } } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await runSafetyGates({ ...diagnosticInput, editorialFields, priorFactcheck: saved });
    expect(result.pass).toBe(true);
    expect(saved).toEqual(before);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.results.find(gate => gate.name === 'factcheck')?.evidence).toEqual(saved);
  });
  it.each(['missing', 'different'])('reassesses an old failed verdict with %s context without mutating it', async kind => {
    const old = { ...report('unverifiable'), ...(kind === 'different' ? { fieldContextHash: 'b'.repeat(64) } : {}) };
    const before = structuredClone(old);
    respondWithFactcheck({ ...report(), editorialReview: editorialProof(), fieldContextHash });
    const result = await runSafetyGates({ ...diagnosticInput, editorialFields, priorFactcheck: old });
    expect(result.pass).toBe(true);
    expect(old).toEqual(before);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string)).toMatchObject({ articleText: diagnosticText, editorialFields });
  });
  it('retains and reuses a failed contextual report with the same hash instead of discarding failures generally', async () => {
    const failed = { ...report('unverifiable'), fieldContextHash };
    respondWithFactcheck(failed);
    const first = await runSafetyGates({ ...diagnosticInput, editorialFields });
    const diagnostic = first.results.find(gate => gate.name === 'factcheck')?.diagnosticEvidence;
    expect(diagnostic).toMatchObject({ fieldContextHash, complete: false });
    respondWithFactcheck(failed);
    const second = await runSafetyGates({ ...diagnosticInput, editorialFields, priorFactcheck: diagnostic });
    expect(second.pass).toBe(false);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
  it('rejects a contextless API answer to a contextual request and rejects inconsistent sidecars before network access', async () => {
    respondWithFactcheck({ ...report(), editorialReview: editorialProof() });
    expect((await runSafetyGates({ ...diagnosticInput, editorialFields })).pass).toBe(false);
    vi.mocked(fetch).mockClear();
    await expect(runSafetyGates({ ...diagnosticInput, editorialFields: { ...editorialFields, content: 'Different body' } })).rejects.toThrow('fields_mismatch');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it.each(['new-sources', 'stale', 'new-text', 'partial-coverage', 'future'])('does not reuse failed review after %s', async kind => {
    const failed = report('unverifiable');
    if (kind === 'stale') failed.checkedAt = new Date(Date.now() - 16 * 60_000).toISOString();
    if (kind === 'future') failed.checkedAt = new Date(Date.now() + 60_000).toISOString();
    if (kind === 'partial-coverage') failed.coverage.checkedUnits = 0;
    respondWithFactcheck(failed);
    await runSafetyGates({ ...diagnosticInput, priorFactcheck: failed,
      ...(kind === 'new-text' ? { title: 'Ny titel' } : {}),
      sourceUrls: [...failed.sources.map(source => source.url), ...(kind === 'new-sources' ? ['https://new.example/news'] : [])] });
    expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]).includes('/api/factcheck'))).toBe(true);
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
    const passed = { ...report(), editorialReview: editorialProof() };
    respondWithFactcheck(passed);
    const result = await runSafetyGates(diagnosticInput);
    expect(result.pass).toBe(true);
    const gate = result.results.find(gate => gate.name === 'factcheck')!;
    expect(gate.evidence).toEqual(passed);
    expect(gate).not.toHaveProperty('diagnosticEvidence');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(vi.mocked(fetch).mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string).editorialReview).toBe('liv-v1');
    expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]).includes('/api/critic/tov'))).toBe(false);
  });

  it.each(['missing', 'wrong-text', 'wrong-voice', 'stale'])('blocks %s combined editorial proof without a second critic call', async kind => {
    const editorialReview = editorialProof();
    if (kind === 'wrong-text') editorialReview.articleHash = 'b'.repeat(64);
    if (kind === 'wrong-voice') editorialReview.voiceHash = 'b'.repeat(64);
    if (kind === 'stale') editorialReview.checkedAt = new Date(Date.now() - 16 * 60_000).toISOString();
    respondWithFactcheck({ ...report(), ...(kind === 'missing' ? {} : { editorialReview }) });
    const result = await runSafetyGates(diagnosticInput);
    expect(result).toMatchObject({ pass: false, failedGate: 'verification-complete', anyGateSkipped: true });
    expect(result.results.find(gate => gate.name === 'tov')).toMatchObject({ pass: false, skipped: true });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it.each(['verdict', 'voice', 'independentAngle', 'sourceAttribution', 'noInventedExperience', 'coherence'])('keeps %s feedback advisory without a concrete material issue', async kind => {
    const editorialReview = { ...editorialProof(), verdict: 'approve' };
    if (kind === 'verdict') editorialReview.verdict = 'revise';
    else editorialReview.checks[kind as keyof typeof editorialReview.checks] = false;
    respondWithFactcheck({ ...report(), editorialReview });
    const result = await runSafetyGates(diagnosticInput);
    expect(result.pass).toBe(true);
    expect(result.results.find(gate => gate.name === 'tov')).toMatchObject({ pass: true, detail: editorialReview.summary });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it.each(['unsupported_thesis', 'incoherent_thesis', 'copied_structure', 'missing_attribution', 'invented_experience'])
    ('blocks a concrete material editorial problem: %s', async kind => {
      const editorialReview = editorialProof();
      editorialReview.blockingIssues = [{ kind, articleQuote: diagnosticInput.content,
        explanation: 'Et konkret alvorligt redaktionelt problem i det præcise citerede artikeludsnit.' }];
      respondWithFactcheck({ ...report(), editorialReview });
      const result = await runSafetyGates(diagnosticInput);
      expect(result).toMatchObject({ pass: false, failedGate: 'tov' });
      expect(result.results.find(gate => gate.name === 'tov')?.detail).toContain(kind);
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    });

  it('does not accept a material issue citing text that is not in the article', async () => {
    const editorialReview = editorialProof();
    editorialReview.blockingIssues = [{ kind: 'invented_experience', articleQuote: 'Jeg var selv til koncerten.',
      explanation: 'Dette opdigtede udsagn findes ikke i den indsendte artikeltekst.' }];
    respondWithFactcheck({ ...report(), editorialReview });
    expect((await runSafetyGates(diagnosticInput)).failedGate).toBe('verification-complete');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it('requires a real combined assessment when an older factual-only receipt lacks editorial evidence', async () => {
    respondWithFactcheck({ ...report(), editorialReview: editorialProof() });
    const result = await runSafetyGates({ ...diagnosticInput, priorFactcheck: report() });
    expect(result.pass).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]).includes('/api/critic/tov'))).toBe(false);
  });

  it('does not reuse combined approval after another potentially conflicting source is supplied', async () => {
    const saved = { ...report(), editorialReview: editorialProof() };
    respondWithFactcheck(saved);
    await runSafetyGates({ ...diagnosticInput, priorFactcheck: saved,
      sourceUrls: [...diagnosticInput.sourceUrls, 'https://additional.example/conflict'] });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]).includes('/api/factcheck'))).toBe(true);
  });

  it('preserves the legacy advisory critic for non-Liv requests', async () => {
    respondWithFactcheck(report());
    const result = await runSafetyGates({ ...diagnosticInput, authorName: 'Other author' });
    expect(result.pass).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string)).not.toHaveProperty('editorialReview');
  });
});
