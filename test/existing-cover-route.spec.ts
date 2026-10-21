import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ access: null as any, stage: vi.fn(), rate: vi.fn() }));
vi.mock('@/lib/mcp/oauth', async original => ({ ...await original<any>(), mcpRequestAccess: async () => state.access, oauthRateLimit: state.rate }));
vi.mock('@/lib/editorial/stage-existing-cover', () => ({ stageExistingCover: state.stage }));
import { POST } from '@/app/api/editorial/existing-cover/route';
import { EXISTING_COVER_AUTHORIZATION as permit } from '@/lib/editorial/existing-cover-authorization';
import { assertPaidAiAllowed } from '@/lib/ai/no-paid-calls';
const req = (bytes = Buffer.from('test'), origin = 'https://ai.aproposmagazine.com', revision = '9', type = 'image/png') =>
  new Request('https://ai.aproposmagazine.com/api/editorial/existing-cover', { method: 'POST',
    headers: { Origin: origin, 'x-submission-revision': revision, 'Content-Type': type }, body: bytes });
beforeEach(() => { vi.clearAllMocks(); state.access = { uid: permit.uid, owner: true }; state.stage.mockResolvedValue({ importStatus: 'awaiting_personal_selection' }); });
it('stages privately under paid-AI guard without exposing an approval action', async () => {
  state.stage.mockImplementation(async () => { expect(() => assertPaidAiAllowed()).toThrow(); return { importStatus: 'awaiting_personal_selection' }; });
  const res = await POST(req()); expect(res.status).toBe(200); expect(res.headers.get('cache-control')).toBe('private, no-store');
  expect(state.stage).toHaveBeenCalledWith(permit.uid, 9, Buffer.from('test'));
});
it.each([null, { uid: permit.uid, owner: false }, { uid: 'colleague', owner: true }])('denies invalid identity %j', async identity => {
  state.access = identity; expect((await POST(req())).status).toBe(403); expect(state.stage).not.toHaveBeenCalled();
});
it('rejects foreign origin, invalid version, MIME, and oversized bodies', async () => {
  expect((await POST(req(Buffer.from('x'), 'https://evil.example'))).status).toBe(403);
  expect((await POST(req(Buffer.from('x'), undefined, '0'))).status).toBe(400);
  expect((await POST(req(Buffer.from('x'), undefined, 'NaN'))).status).toBe(400);
  expect((await POST(req(Buffer.from('x'), undefined, '9', 'application/json'))).status).toBe(400);
  expect((await POST(req(Buffer.alloc(permit.byteCount + 1)))).status).toBe(413); expect(state.stage).not.toHaveBeenCalled();
});
it('never returns raw credentials or provider errors', async () => {
  state.stage.mockRejectedValue(Error('secret=PRIVATE')); expect(await (await POST(req())).json()).toEqual({ error: 'invalid_request' });
});
