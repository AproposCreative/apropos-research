import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ access: vi.fn(), status: vi.fn(), read: vi.fn(), state: vi.fn(), approve: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mock.access }));
vi.mock('@/lib/mcp/publication', () => ({ getPublicationStatus: mock.status, readPublication: mock.read,
  publicationState: mock.state, approvePublication: mock.approve }));
import { GET } from '@/app/oauth/publication/route';
import { assertPaidAiAllowed } from '@/lib/ai/no-paid-calls';
const previewId = '00000000-0000-4000-8000-000000000000';
const request = () => new Request(`https://ai.aproposmagazine.com/oauth/publication?id=${previewId}&view=status&uid=casper`);
beforeEach(() => {
  vi.clearAllMocks(); mock.access.mockResolvedValue({ uid: 'frederik', owner: true });
  mock.status.mockResolvedValue({ status: 'awaiting_confirmation', publicationVerified: false, readOnly: true });
});
it.each([null, { uid: 'casper', owner: false }, { uid: 'milo', owner: false }])('denies missing and non-owner sessions: %j', async access => {
  mock.access.mockResolvedValue(access); expect((await GET(request())).status).toBe(403); expect(mock.status).not.toHaveBeenCalled();
});
it('uses the same read-only status service with the server owner, no preview refresh or approval', async () => {
  const response = await GET(request()); expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toMatchObject({ publicationVerified: false, readOnly: true });
  expect(mock.status).toHaveBeenCalledExactlyOnceWith('frederik', previewId);
  expect(mock.read).not.toHaveBeenCalled(); expect(mock.state).not.toHaveBeenCalled(); expect(mock.approve).not.toHaveBeenCalled();
});
it('never performs paid work or leaks raw read failures through the first-party route', async () => {
  mock.status.mockImplementation(async () => { assertPaidAiAllowed(); });
  expect((await GET(request())).status).toBe(409);
  mock.status.mockRejectedValue(Error('private-token private-article'));
  const response = await GET(request()); expect(response.status).toBe(409);
  expect(await response.text()).not.toContain('private-');
});
