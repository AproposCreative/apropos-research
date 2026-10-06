import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ access: null as any, accept: vi.fn(), approve: vi.fn(), after: vi.fn(), worker: vi.fn() }));
vi.mock('next/server', () => ({ after: (fn: unknown) => state.after(fn) }));
vi.mock('@/lib/mcp/oauth', () => ({ mcpRequestAccess: async () => state.access }));
vi.mock('@/lib/editorial/submissions', () => ({ getSubmissionStatus: vi.fn() }));
vi.mock('@/lib/editorial/submission-approval', () => ({ quoteSubmission: vi.fn(), acceptSubmissionQuote: (...args: unknown[]) => state.accept(...args) }));
vi.mock('@/lib/editorial/submission-publication', () => ({ submissionPublicationPreview: vi.fn(), approveSubmissionPublication: (...args: unknown[]) => state.approve(...args), publishSubmission: vi.fn() }));
vi.mock('@/lib/editorial/submission-worker', () => ({ runSubmissionStep: (...args: unknown[]) => state.worker(...args) }));
import { POST } from '@/app/api/editorial/submissions/route';
import { MCP_ORIGIN } from '@/lib/mcp/config';
const body = { action: 'accept_quote', id: 'a'.repeat(64), revision: 1, quoteId: 'b'.repeat(64) };
const request = (input = body, origin = MCP_ORIGIN) => new Request(`${MCP_ORIGIN}/api/editorial/submissions`, {
  method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
beforeEach(() => { vi.clearAllMocks(); state.access = { uid: 'owner', owner: true }; state.accept.mockResolvedValue({ accepted: true }); });
it('rejects unauthenticated accounts before approval or dispatch', async () => {
  for (const access of [null]) {
    state.access = access; expect((await POST(request())).status).toBe(401);
  }
  expect(state.accept).not.toHaveBeenCalled(); expect(state.after).not.toHaveBeenCalled();
});
it('passes the authenticated team UID to the ownership-checked submission service', async () => {
  state.access = { uid: 'colleague', owner: false };
  expect((await POST(request())).status).toBe(202);
  expect(state.accept).toHaveBeenCalledWith('colleague', body.id, 1, body.quoteId);
});
it('requires first-party origin and rejects caller-supplied approval fields', async () => {
  expect((await POST(request(body, 'https://chatgpt.com'))).status).toBe(403);
  expect((await POST(request({ ...body, approved: true } as typeof body))).status).toBe(409);
  expect(state.accept).not.toHaveBeenCalled();
});
it('persists personal price acceptance before dispatch and does not publish', async () => {
  expect((await POST(request())).status).toBe(202);
  expect(state.accept).toHaveBeenCalledWith('owner', body.id, 1, body.quoteId);
  expect(state.after).toHaveBeenCalledTimes(1); expect(state.approve).not.toHaveBeenCalled();
});
