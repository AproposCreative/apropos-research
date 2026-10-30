import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fitSubtitleAutomatically } from '../app/design-editor/subtitleCopy';
import { socialSubtitleKey, socialSubtitleQuoteDkkMicros, SOCIAL_SUBTITLE_LIMIT_DKK_MICROS } from '../lib/ai/social-subtitle-budget';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), claim: vi.fn(), finish: vi.fn(), resume: vi.fn(), create: vi.fn(), previous: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mocks.auth }));
vi.mock('@/lib/config/env', () => ({ config: { openai: { apiKey: 'test-key' } } }));
vi.mock('@/lib/ai/social-subtitle-budget', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/ai/social-subtitle-budget')>();
  return { ...actual, claimSocialSubtitle: mocks.claim, finishSocialSubtitle: mocks.finish,
    resumeSocialSubtitleBudget: mocks.resume, previousSocialSubtitleCandidates: mocks.previous };
});
vi.mock('openai', () => ({ default: class {
  chat = { completions: { create: mocks.create } };
} }));
import { POST } from '../app/api/design-editor/shorten-subtitle/route';
import { POST as resumePOST } from '../app/api/design-editor/resume-subtitle/route';
const source = 'Kontrapunkt har formet DSB og TV 2. Nu undersøger Designmuseum Danmark bureauets arbejde og grænsen mellem designhistorie og reklame.';
const input = { articleId: '6accb9d4a4cfa06c22daba31', title: 'Kontrapunkt har tegnet Danmark. Men er kundearbejde kunst?', subtitle: source, size: 'square' };
const request = (body: unknown) => new NextRequest('http://localhost/api/design-editor/shorten-subtitle', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ uid: 'owner', role: 'admin', owner: true });
  mocks.previous.mockResolvedValue([]);
  mocks.claim.mockResolvedValue({ state: 'reserved', key: 'cache-key', generation: 0 }); mocks.finish.mockResolvedValue(undefined);
  mocks.resume.mockResolvedValue({ generation: 1 });
  mocks.create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: '{"main":"Kontrapunkt former vores visuelle hverdag.","shorter":"Design sætter spor."}' } }],
    usage: { prompt_tokens: 100, completion_tokens: 40 } }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('SoMe subtitle AI', () => {
  it('generates complete Danish candidates after one budget reservation', async () => {
    const response = await POST(request(input));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ candidates: ['Kontrapunkt former vores visuelle hverdag.', 'Design sætter spor.'], source: 'ai' });
    expect(mocks.claim).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.finish).toHaveBeenCalledWith('cache-key', ['Kontrapunkt former vores visuelle hverdag.', 'Design sætter spor.'], expect.any(Object), undefined);
  });
  it('shortens the card title using the same budget but a distinct cache key', async () => {
    mocks.create.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content:
      '{"main":"Kontrapunkt tegner Danmark på ny","shorter":"Er kundearbejde kunst?"}' } }],
      usage: { prompt_tokens: 120, completion_tokens: 35 } });
    const titleInput = { ...input, field: 'title' as const };
    const response = await POST(request(titleInput));
    expect(response.status).toBe(200);
    expect((await response.json()).candidates).toEqual(['Kontrapunkt tegner Danmark på ny', 'Er kundearbejde kunst?']);
    expect(mocks.claim).toHaveBeenCalledWith(titleInput, 'owner', expect.stringContaining('overskrifter'), 0);
    expect(socialSubtitleKey(titleInput)).not.toBe(socialSubtitleKey(input));
  });
  it('returns cached or pending copy without another provider request', async () => {
    mocks.claim.mockResolvedValueOnce({ state: 'ready', candidates: ['En gemt sætning.'] })
      .mockResolvedValueOnce({ state: 'pending' });
    expect((await (await POST(request(input))).json()).candidates).toEqual(['En gemt sætning.']);
    const pending = await POST(request(input));
    expect(pending.status).toBe(202);
    expect(pending.headers.get('retry-after')).toBe('1');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('labels a retained quota failure as historical and returns its recovery generation without transport', async () => {
    mocks.claim.mockResolvedValueOnce({ state: 'failed', reason: 'quota_exhausted', generation: 1 });
    const response = await POST(request(input)), body = await response.json();
    expect(response.status).toBe(502);
    expect(body).toMatchObject({ code: 'quota_exhausted', generation: 1 });
    expect(body.error).toMatch(/^Et tidligere AI-kald blev afvist/);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.finish).not.toHaveBeenCalled();
  });
  it('requests a distinct, explicit variant and excludes earlier suggestions', async () => {
    mocks.previous.mockResolvedValue(['Kontrapunkt former vores visuelle hverdag.']);
    mocks.create.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content:
      '{"main":"Designhistorie møder reklame på museet.","shorter":"Kontrapunkt former vores visuelle hverdag."}' } }],
      usage: { prompt_tokens: 120, completion_tokens: 45 } });
    const response = await POST(request({ ...input, variant: 1 }));
    expect(response.status).toBe(200);
    expect((await response.json()).candidates).toEqual(['Designhistorie møder reklame på museet.']);
    expect(mocks.claim).toHaveBeenCalledWith(input, 'owner', expect.stringContaining('previousSuggestionsToAvoid'), 1);
    expect(mocks.finish).toHaveBeenCalledWith('cache-key', ['Designhistorie møder reklame på museet.'], expect.any(Object), undefined);
  });
  it('preserves authentication', async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await POST(request(input))).status).toBe(401);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it('rejects malformed input before reservation', async () => {
    for (const body of [null, [], {}, { ...input, articleId: 'bad' }, { ...input, size: 'bad' }, { ...input, subtitle: 'x'.repeat(5001) }, { ...input, title: 'x'.repeat(1001) }, { ...input, subtitle: ' ' },
      { ...input, variant: -1 }, { ...input, variant: 6 }, { ...input, variant: 1.5 }, { ...input, field: 'body' }])
      expect((await POST(request(body))).status).toBe(400);
    const invalid = new NextRequest('http://localhost/api/design-editor/shorten-subtitle', { method: 'POST', body: '{' });
    expect((await POST(invalid)).status).toBe(400);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it('does not retry a paid failure or claim an invalid model response', async () => {
    mocks.create.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: '{"main":"En ufærdig…","shorter":"Også ufærdig…"}' } }] });
    expect((await POST(request(input))).status).toBe(502);
    expect(mocks.finish).toHaveBeenCalledWith('cache-key', null, undefined, 'invalid_response');
    mocks.claim.mockResolvedValue({ state: 'failed', reason: 'invalid_response' });
    expect((await POST(request(input))).status).toBe(502);
    expect(mocks.create).toHaveBeenCalledOnce();
  });
  it('returns a clear cap error before transport', async () => {
    mocks.claim.mockRejectedValue(new Error('social_subtitle_budget_exceeded'));
    expect((await POST(request(input))).status).toBe(429);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('requires the owner and matching generation to reopen without calling the provider', async () => {
    const req = () => new NextRequest('http://localhost/api/design-editor/resume-subtitle',
      { method: 'POST', body: JSON.stringify({ expectedGeneration: 0 }) });
    mocks.auth.mockResolvedValueOnce({ uid: 'editor', role: 'editor', owner: false });
    expect((await resumePOST(req())).status).toBe(403);
    expect(mocks.resume).not.toHaveBeenCalled();
    const result = await resumePOST(req());
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ resumed: true, generation: 1 });
    expect(mocks.resume).toHaveBeenCalledWith('owner', 0);
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.resume.mockRejectedValueOnce(Error('social_subtitle_resume_conflict'));
    expect((await resumePOST(req())).status).toBe(409);
  });
  it('uses a stable content key and a bounded per-call reserve below 10 kr.', () => {
    expect(socialSubtitleKey(input)).toBe(socialSubtitleKey({ ...input }));
    expect(socialSubtitleKey(input)).not.toBe(socialSubtitleKey({ ...input, subtitle: source + ' Ny version.' }));
    const quote = socialSubtitleQuoteDkkMicros(JSON.stringify(input));
    expect(quote).toBeGreaterThan(0);
    expect(quote).toBeLessThan(SOCIAL_SUBTITLE_LIMIT_DKK_MICROS);
  });
  it('automatically fits Kontrapunkt without a click or a rewrite', () => {
    expect(fitSubtitleAutomatically(source, undefined, text => text.length <= 90)).toEqual({
      text: 'Kontrapunkt har formet DSB og TV 2.', source: 'excerpt', readable: true, truncated: false,
    });
  });
  it.each(['En kort tekst.', '', 'Det begyndte… Og sluttede.'])('preserves a fitting original: %s', text => {
    expect(fitSubtitleAutomatically(text, undefined, () => true)).toMatchObject({ text, source: 'original', readable: true });
  });
  it('prefers a complete leading passage, never a later unrelated sentence', () => {
    const original = 'Hun lytter. Han svarer. En længere afslutning følger herefter.';
    expect(fitSubtitleAutomatically(original, undefined, t => t.length <= 25).text).toBe('Hun lytter. Han svarer.');
    const long = 'Første sætning '.repeat(30) + '. Kort.';
    const result = fitSubtitleAutomatically(long, undefined, t => t.length <= 35);
    expect(result.text).toBe('Første sætning Første sætning…');
    expect(result.truncated).toBe(true);
  });
  it('keeps the Lanterns verdict as a complete, source-exact clause instead of clipping its lead', () => {
    const original = 'Aaron Pierre og Kyle Chandler efterforsker en kosmisk forbrydelse, men HBO-serien giver mig hverken nok superhelt eller nok menneske.';
    expect(fitSubtitleAutomatically(original, undefined, text => text.length <= 75)).toEqual({
      text: 'HBO-serien giver mig hverken nok superhelt eller nok menneske.',
      source: 'excerpt', readable: true, truncated: false,
    });
    expect(fitSubtitleAutomatically(original, undefined, text => text.length <= 140).text).toBe(original);
    const segmenter = Intl.Segmenter;
    try {
      Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true });
      expect(fitSubtitleAutomatically(original, undefined, text => text.length <= 75).text)
        .toBe('HBO-serien giver mig hverken nok superhelt eller nok menneske.');
    } finally {
      Object.defineProperty(Intl, 'Segmenter', { value: segmenter, configurable: true });
    }
  });
  it('does not promote a dependent contrast fragment to standalone copy', () => {
    const original = 'Serien undersøger de to helte, men ikke deres venskab.';
    expect(fitSubtitleAutomatically(original, undefined, text => text.length <= 35)).toMatchObject({
      source: 'excerpt', truncated: true,
    });
  });
  it('uses marked word-boundary excerpts when native segmentation is unavailable', () => {
    const original = Intl.Segmenter;
    try { Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true });
      expect(fitSubtitleAutomatically(source, undefined, t => t.length <= 40)).toMatchObject({ source: 'excerpt', truncated: true, readable: true }); }
    finally { Object.defineProperty(Intl, 'Segmenter', { value: original, configurable: true }); }
  });
  it('uses prewritten ChatGPT copy only when it actually fits, otherwise fits the original', () => {
    expect(fitSubtitleAutomatically(source, 'Designhistorie møder reklame.', t => t.length <= 50)).toMatchObject({ text: 'Designhistorie møder reklame.', source: 'chatgpt' });
    expect(fitSubtitleAutomatically(source, 'Alt for lang '.repeat(30), t => t.length <= 50).source).toBe('excerpt');
  });
  it('does not hide an unbreakable word or a measurement failure', () => {
    expect(fitSubtitleAutomatically('x'.repeat(300), undefined, () => false)).toMatchObject({ readable: false, source: 'original' });
    expect(fitSubtitleAutomatically(source, undefined, () => false).text).toBe(source);
  });
  it('keeps a single long sentence readable with an explicit ellipsis', () => {
    const text = 'Museet undersøger bureauets arbejde og grænsen mellem designhistorie og reklame';
    const result = fitSubtitleAutomatically(text, undefined, t => t.length <= 35);
    expect(result).toMatchObject({ text: 'Museet undersøger bureauets…', readable: true, truncated: true });
  });
});
