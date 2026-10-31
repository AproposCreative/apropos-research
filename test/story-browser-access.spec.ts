import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), request: vi.fn(), db: vi.fn(), getUser: vi.fn(), entry: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mocks.access, readEditorialAccessEntry: mocks.entry }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: mocks.db, getAdminAuth: () => ({ getUser: mocks.getUser }) }));
vi.mock('@/lib/social/story-browser', () => ({ storyBrowserConfigured: () => true, storyBrowserRequest: mocks.request }));
import { GET, POST } from '@/app/api/instagram/story-connection/route';
import { POST as approve } from '@/app/api/internal/social-story-approval/route';
const operationId = 'a'.repeat(64);
const receipt = () => ({ ownerUid: 'owner', delivery: 'business-suite', createdAt: new Date().toISOString(), phase: 'story_preparing', complete: false,
  imageSha256: 'digest', channels: { instagram: true, facebook: false }, approved: { isStory: true, articleUrl: 'https://www.aproposmagazine.com/articles/tony' } });
const request = (body: unknown, secret = 'test-secret-at-least-24-characters') => new Request('https://example.test/api', { method: 'POST', headers: { 'x-internal-api-secret': secret }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('INTERNAL_API_SECRET', 'test-secret-at-least-24-characters');
  mocks.access.mockResolvedValue({ uid: 'owner', owner: true }); mocks.request.mockResolvedValue(Response.json({ connected: true, secret: 'must-not-return' }));
  mocks.db.mockReturnValue({ collection: () => ({ doc: () => ({ get: async () => ({ data: receipt }) }) }) });
  mocks.getUser.mockResolvedValue({ uid: 'owner', email: 'frederik@aproposmagazine.com', emailVerified: true, disabled: false });
  mocks.entry.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
it('requires verified owner access to inspect or control the hosted login', async () => {
  mocks.access.mockResolvedValue({ uid: 'editor', owner: false });
  expect((await GET(request({}))).status).toBe(403);
  expect((await POST(request({ action: 'begin' }))).status).toBe(403); expect(mocks.request).not.toHaveBeenCalled();
});
it('binds setup to the verified UID, rejects arbitrary URLs and never returns raw worker state', async () => {
  const response = await POST(request({ action: 'begin' }));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ connected: true });
  expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toEqual({ action: 'begin', ownerUid: 'owner' });
  expect((await POST(request({ action: 'begin', ownerUid: 'someone-else' }))).status).toBe(400);
  expect((await POST(request({ action: 'goto', url: 'https://attacker.test' }))).status).toBe(400);
  expect((await POST(request({ action: 'text', text: 'no-setup-identity' }))).status).toBe(400);
});
it('revalidates the exact personal approval and current editorial access before publish', async () => {
  const response = await approve(request({ operationId })); expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ approved: true, imageSha256: 'digest', articleUrl: receipt().approved.articleUrl });
  mocks.getUser.mockResolvedValueOnce({ email: 'frederik@aproposmagazine.com', emailVerified: true, disabled: true });
  expect((await approve(request({ operationId }))).status).toBe(403);
  mocks.entry.mockResolvedValueOnce({ active: false, role: 'editor' });
  expect((await approve(request({ operationId }))).status).toBe(403);
  expect((await approve(request({ operationId }, 'wrong-secret'))).status).toBe(401);
});
it.each([
  { createdAt: 'not-a-date' }, { createdAt: new Date(Date.now()-31*60_000).toISOString() },
  { complete: true }, { phase: 'story_sending' }, { channels: { instagram: true, facebook: true } },
])('stops invalid, completed or expired personal approvals: %j', async changed => {
  mocks.db.mockReturnValue({ collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ ...receipt(), ...changed }) }) }) }) });
  expect((await approve(request({ operationId }))).status).toBe(403);
});
