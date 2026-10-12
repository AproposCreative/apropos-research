import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { firstSubtitleSentence, subtitleChatPrompt } from '../app/design-editor/subtitleCopy';
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
  it('offers only the exact first full sentence of Kontrapunkt', () => {
    expect(firstSubtitleSentence(source)).toBe('Kontrapunkt har formet DSB og TV 2.');
    expect(source.startsWith(firstSubtitleSentence(source)!)).toBe(true);
  });
  it.each(['En kort tekst.', 'En meget lang tekst uden punktum', '', 'Det begyndte… Og sluttede.'])('never truncates or invents copy: %s', text => {
    expect(firstSubtitleSentence(text)).toBeNull();
  });
  it('does not use a later, unrelated sentence to fit', () => {
    const first = 'Første sætning '.repeat(30) + '.';
    expect(firstSubtitleSentence(first + ' Kort.')).toBe(first);
  });
  it('fails closed when native segmentation is unavailable', () => {
    const original = Intl.Segmenter;
    try { Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true }); expect(firstSubtitleSentence(source)).toBeNull(); }
    finally { Object.defineProperty(Intl, 'Segmenter', { value: original, configurable: true }); }
  });
  it.each([['square', 90, '1:1'], ['story', 130, '9:16']] as const)('builds a source-preserving ChatGPT handoff for %s', (size, limit, ratio) => {
    const prompt = subtitleChatPrompt(input.title, source, size);
    expect(prompt).toContain(`højst ${limit} tegn`);
    expect(prompt).toContain(ratio);
    expect(prompt).toContain('Foretag ingen værktøjskald');
    expect(JSON.parse(prompt.split('\n\n')[1])).toEqual({ overskrift: input.title, undertekst: source });
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
  });
});
