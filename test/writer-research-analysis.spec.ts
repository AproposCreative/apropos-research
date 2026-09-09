import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), warn: vi.fn() }));
vi.mock('@/lib/newsletter/auth-request', () => ({ getNewsletterUserIdFromRequest: m.auth }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: m.create } } }), models: { default: 'fixture-model' } }));
vi.mock('@/lib/logger', () => ({ createRequestLogger: () => ({ warn: m.warn, error: vi.fn(), info: vi.fn() }) }));
import { POST } from '@/app/api/analyze-research/route';
const data = { trend: 'Stigende', angle: 'Film og socialt ubehag', audience: 'Kulturlæsere', suggestions: Array.from({ length: 5 }, (_, i) => `Researchspor ${i}`) };
const request = (body: unknown = { title: 'Film', content: 'Readable source', source: 'fixture' }) => new NextRequest('https://studio.example/api/analyze-research', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); m.auth.mockResolvedValue('editor');
  m.create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }] });
});
it('uses the supported completion budget and returns bounded analysis, not a measured trend', async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload.data).toMatchObject({ ...data, trend: 'Ikke dokumenteret' });
  expect(response.headers.get('cache-control')).toBe('no-store');
  const [body, options] = m.create.mock.calls[0];
  expect(body.max_completion_tokens).toBe(3000);
  expect(body).not.toHaveProperty('max_tokens');
  expect(body).not.toHaveProperty('temperature');
  expect(options).toMatchObject({ timeout: 45000, maxRetries: 0 });
  expect(options.signal).toBeInstanceOf(AbortSignal);
});
it('requires authentication before any generation', async () => {
  m.auth.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  expect(m.create).not.toHaveBeenCalled();
});
it.each([null, [], { title: 4 }, { content: [] }, { keyPoints: [1] }, {}])('rejects malformed input %o', async body => {
  expect((await POST(request(body))).status).toBe(400);
  expect(m.create).not.toHaveBeenCalled();
});
it.each(['not-json', '{}', JSON.stringify({ ...data, suggestions: [] }), JSON.stringify({ ...data, angle: 3 })])('never substitutes fabricated fallback analysis for invalid output %s', async text => {
  m.create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: text } }] });
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).not.toHaveProperty('data');
});
it('rejects truncated completion even when its JSON looks valid', async () => {
  m.create.mockResolvedValue({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(data) } }] });
  expect((await POST(request())).status).toBe(503);
});
it('keeps provider bodies out of logs and the response', async () => {
  m.create.mockRejectedValue(Object.assign(new Error('private-provider-body'), { status: 429 }));
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(JSON.stringify([await response.json(), m.warn.mock.calls])).not.toContain('private-provider-body');
});
