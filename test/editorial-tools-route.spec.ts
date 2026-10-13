import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), hold: vi.fn(), control: vi.fn(), inbox: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ verifyEditorialToken: m.auth }));
vi.mock('@/lib/ai/provider-hold', () => ({ readProviderHold: m.hold }));
vi.mock('@/lib/accreditation/agent-control', () => ({ getAgentControl: m.control }));
vi.mock('@/lib/liv-inbox/settings-store', () => ({ getLivInboxSettings: m.inbox }));
import * as route from '@/app/api/editorial/tools/route';
const request = (token = '') => new Request('https://test/api/editorial/tools', { headers: token ? { authorization: `Bearer ${token}` } : {} });
beforeEach(() => { vi.resetAllMocks(); m.hold.mockResolvedValue({ blocked: true }); m.control.mockResolvedValue({ paused: true }); m.inbox.mockResolvedValue({ autoRespond: false }); });
it('requires authenticated approved access before reading flags', async () => {
  expect((await route.GET(request())).status).toBe(401);
  expect((await route.GET(request('denied'))).status).toBe(401);
  expect(m.hold).not.toHaveBeenCalled();
});
it('returns private read-only owner catalogue with actual paused flags', async () => {
  m.auth.mockResolvedValue({ owner: true });
  const r = await route.GET(request('owner'));
  expect(r.headers.get('cache-control')).toBe('private, no-store');
  const data = await r.json();
  expect(data.tools.filter((x: { hidden: boolean }) => x.hidden)).toHaveLength(3);
  expect(data.tools.find((x: { id: string }) => x.id === 'liv-inbox')).toMatchObject({
    hidden: false, status: 'Autosvar slået fra. Manuel gennemgang er tilgængelig.',
  });
  expect(Object.keys(route).sort()).toEqual(['GET', 'dynamic', 'runtime']);
});
it('does not read private inbox settings or expose private chat to colleagues', async () => {
  m.auth.mockResolvedValue({ owner: false });
  const data = await (await route.GET(request('colleague'))).json();
  expect(m.inbox).not.toHaveBeenCalled();
  expect(data.tools.some((x: { id: string }) => x.id === 'chatgpt-editorial')).toBe(false);
});
it('isolates a flag read failure instead of hiding all tools or declaring health', async () => {
  m.auth.mockResolvedValue({ owner: true }); m.hold.mockRejectedValue(new Error('offline'));
  const data = await (await route.GET(request('owner'))).json();
  expect(data.tools.find((x: { id: string }) => x.id === 'ai-writer')).toMatchObject({ hidden: false, status: 'API-status kunne ikke bekræftes.' });
  expect(data.tools.find((x: { id: string }) => x.id === 'akkreditering').hidden).toBe(true);
});
