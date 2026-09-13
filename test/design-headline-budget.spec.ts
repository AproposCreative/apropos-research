import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { currentLivCostContext } from '@/lib/liv/cost-context';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
const m = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/api/middleware-auth', () => ({ isApiRequestAuthorized: m.auth }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: m.create } } }), models: { default: 'test' } }));
import { POST } from '@/app/api/design-editor/more-clickbait/route';
const request = () => new NextRequest('http://localhost/api/design-editor/more-clickbait', { method: 'POST', body: JSON.stringify({ title: 'Anmeldelse: Klovn sæson 11', content: 'Kildetekst' }) });
beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue(true); vi.stubEnv('AI_SHARED_COST_ENABLED', 'true'); });
afterEach(() => vi.unstubAllEnvs());
it('uses one bounded Writer call and accepts clear subject-first wording', async () => {
  m.create.mockImplementation(async (_, options) => {
    expect(currentLivCostContext()).toMatchObject({ scope: 'writer', stage: 'design-headline' });
    expect(options).toMatchObject({ maxRetries: 0, timeout: 45000 });
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ title: 'Anmeldelse: Klovn sæson 11', excerpt: 'En sæson med modstand.' }) } }] };
  });
  expect((await POST(request())).status).toBe(200); expect(m.create).toHaveBeenCalledTimes(1);
});
it.each(['{}', 'broken', JSON.stringify({ title: 'x'.repeat(71), excerpt: 'Kort' })])('rejects unusable output without retry or invented fallback: %s', async content => {
  m.create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content } }] });
  const response = await POST(request()); expect(response.status).toBe(502);
  expect(await response.json()).not.toHaveProperty('title'); expect(m.create).toHaveBeenCalledTimes(1);
});
it('returns budget refusal without provider error exposure', async () => {
  m.create.mockRejectedValue(new LivCostPretransportError('limit'));
  const response = await POST(request()); expect(response.status).toBe(503); expect(response.headers.get('cache-control')).toBe('no-store');
});
it('rejects unauthenticated work before model access', async () => {
  m.auth.mockResolvedValue(false); expect((await POST(request())).status).toBe(401); expect(m.create).not.toHaveBeenCalled();
});
