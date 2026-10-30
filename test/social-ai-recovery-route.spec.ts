import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ access: vi.fn(), status: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mocks.access }));
vi.mock('@/lib/ai/social-subtitle-budget', () => ({ readSocialSubtitleStatus: mocks.status }));
import { GET } from '../app/api/design-editor/subtitle-status/route';

beforeEach(() => { vi.resetAllMocks(); mocks.access.mockResolvedValue({ uid: 'editor', owner: false });
  mocks.status.mockResolvedValue({ generation: 2, blocked: false }); });

it('requires verified editorial access before revealing a generation', async () => {
  mocks.access.mockResolvedValueOnce(null);
  const r = await GET(new NextRequest('http://localhost/api/design-editor/subtitle-status'));
  expect(r.status).toBe(401); expect(mocks.status).not.toHaveBeenCalled();
});
it('returns a private no-store recovery signal for an editor, without a resume', async () => {
  const r = await GET(new NextRequest('http://localhost/api/design-editor/subtitle-status'));
  expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toBe('no-store');
  expect(await r.json()).toEqual({ generation: 2, blocked: false });
  expect(mocks.status).toHaveBeenCalledOnce();
});
it('does not claim recovery or expose provider/account errors when the store fails', async () => {
  mocks.status.mockRejectedValueOnce(Error('private credentials'));
  const r = await GET(new NextRequest('http://localhost/api/design-editor/subtitle-status'));
  expect(r.status).toBe(503); expect(JSON.stringify(await r.json())).not.toContain('private credentials');
});
