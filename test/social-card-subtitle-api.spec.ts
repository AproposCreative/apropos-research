import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/newsletter/auth-request', () => ({ getNewsletterUserIdFromRequest: mocks.auth }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: mocks.client, models: { default: 'existing-model' } }));
import { POST } from '../app/api/design-editor/shorten-subtitle/route';
const source = 'Jeg køber hverken den martrede kunstner eller det perfekte værtspar. Olivia Wildes middagskomedie har en langt bedre idé: Lad dem få gæster.';
const request = (body: unknown) => new NextRequest('http://localhost/api/design-editor/shorten-subtitle', { method: 'POST', body: JSON.stringify(body) });
const input = { title: 'The Invite', subtitle: source, size: 'square' };
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue('user'); mocks.client.mockReturnValue({ chat: { completions: { create: mocks.create } } }); });
describe('card-only AI subtitle', () => {
  it('requires login before spending AI tokens', async () => { mocks.auth.mockResolvedValue(null); expect((await POST(request(input))).status).toBe(401); expect(mocks.client).not.toHaveBeenCalled(); });
  it('rejects oversized or malformed input', async () => { for (const body of [null, {}, { ...input, size: 'bad' }, { ...input, subtitle: 'x'.repeat(5001) }]) expect((await POST(request(body))).status).toBe(400); expect(mocks.create).not.toHaveBeenCalled(); });
  it('returns validated subtitle candidates without altering title or source', async () => { mocks.create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ subtitle: 'Olivia Wilde inviterer gæster til parforholdets problemer.', shorter: 'Parforholdet får gæster.', title: 'Unwanted rewrite' }) } }] }); const response = await POST(request(input)); expect(response.status).toBe(200); expect(await response.json()).toEqual({ candidates: ['Olivia Wilde inviterer gæster til parforholdets problemer.', 'Parforholdet får gæster.'] }); expect(input.subtitle).toBe(source); });
  it('never invents fallback copy when AI is missing or invalid', async () => { mocks.client.mockReturnValue(null); expect((await POST(request(input))).status).toBe(503); mocks.client.mockReturnValue({ chat: { completions: { create: mocks.create } } }); for (const content of ['not json', '{}', JSON.stringify({ subtitle: 'x'.repeat(91) })]) { mocks.create.mockResolvedValue({ choices: [{ message: { content } }] }); const response = await POST(request(input)); expect(response.status).toBe(502); expect(await response.json()).not.toHaveProperty('candidates'); } });
});
