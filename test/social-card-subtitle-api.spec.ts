import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { fitSubtitleAutomatically } from '../app/design-editor/subtitleCopy';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/newsletter/auth-request', () => ({ getNewsletterUserIdFromRequest: mocks.auth }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: mocks.client, models: { default: 'must-not-run' } }));
import { POST } from '../app/api/design-editor/shorten-subtitle/route';
const source = 'Kontrapunkt har formet DSB og TV 2. Nu undersøger Designmuseum Danmark bureauets arbejde og grænsen mellem designhistorie og reklame.';
const input = { title: 'Kontrapunkt har tegnet Danmark. Men er kundearbejde kunst?', subtitle: source, size: 'square' };
const request = (body: unknown) => new NextRequest('http://localhost/api/design-editor/shorten-subtitle', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue('user'); mocks.client.mockReturnValue({ chat: { completions: { create: mocks.create } } }); });
afterEach(() => { expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('SoMe subtitles without paid backend AI', () => {
  it('retires paid requests from old tabs even when a client could exist', async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await POST(request(input));
      expect(response.status).toBe(410);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toMatchObject({ code: 'subtitle_chatgpt_first', paidAiCalls: 0 });
    }
    expect(input.subtitle).toBe(source);
  });
  it('works without an OpenAI client', async () => {
    mocks.client.mockReturnValue(null);
    const result = await (await POST(request(input))).json();
    expect(result.error).toContain('Genindlæs');
    expect(result).not.toHaveProperty('candidates');
  });
  it('preserves authentication', async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await POST(request(input))).status).toBe(401);
  });
  it('rejects malformed input without any generation', async () => {
    for (const body of [null, [], {}, { ...input, size: 'bad' }, { ...input, subtitle: 'x'.repeat(5001) }, { ...input, title: 'x'.repeat(1001) }, { ...input, subtitle: ' ' }])
      expect((await POST(request(body))).status).toBe(400);
    const invalid = new NextRequest('http://localhost/api/design-editor/shorten-subtitle', { method: 'POST', body: '{' });
    expect((await POST(invalid)).status).toBe(400);
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
  it('contains no model imports or network generation in route, hook or controls', () => {
    for (const file of ['app/api/design-editor/shorten-subtitle/route.ts', 'app/design-editor/useCardSubtitle.ts', 'app/design-editor/SubtitleControls.tsx', 'app/design-editor/subtitleCopy.ts']) {
      const code = readFileSync(file, 'utf8');
      expect(code).not.toMatch(/getOpenAIClient|withSharedCostContext|chat\.completions|fetch\s*\(/);
    }
    const view = readFileSync('app/design-editor/DesignEditorView.tsx', 'utf8');
    expect(view).not.toContain('Forkort med AI');
    expect(view).toContain('if (!subtitle.ready)');
    expect(view).toContain('excerpt: subtitle.text || undefined');
    expect(readFileSync('app/design-editor/SubtitleControls.tsx', 'utf8')).not.toContain('clipboard');
  });
});
