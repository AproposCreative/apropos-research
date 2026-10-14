import { beforeEach, expect, it, vi } from 'vitest';
const candidate = vi.hoisted(() => ({ select: vi.fn(), decline: vi.fn() }));
vi.mock('@/lib/editorial/generated-image-candidate', () => ({ imageCandidatePreviews: async () => ({}), selectGeneratedImage: (...args: unknown[]) => candidate.select(...args), declineGeneratedImage: (...args: unknown[]) => candidate.decline(...args) }));
const state = vi.hoisted(() => ({ access: null as any, accept: vi.fn(), approve: vi.fn(), after: vi.fn(), worker: vi.fn(), consent: vi.fn(), workflow: vi.fn(), resume: vi.fn() }));
vi.mock('@/lib/editorial/submission-cms-resume', () => ({ resumeSubmissionCms: (...args: unknown[]) => state.resume(...args) }));
vi.mock('@/lib/editorial/submission-consent', () => ({ submissionConsentOffer: vi.fn(), acceptSubmissionConsent: (...args: unknown[]) => state.consent(...args) }));
vi.mock('next/server', () => ({ after: (fn: unknown) => state.after(fn) }));
vi.mock('@/lib/mcp/oauth', () => ({ mcpRequestAccess: async () => state.access }));
vi.mock('@/lib/editorial/submissions', () => ({ getSubmissionStatus: vi.fn() }));
vi.mock('@/lib/editorial/submission-approval', () => ({ quoteSubmission: vi.fn(), acceptSubmissionQuote: (...args: unknown[]) => state.accept(...args) }));
vi.mock('@/lib/editorial/submission-publication', () => ({ submissionPublicationPreview: vi.fn(), approveSubmissionPublication: (...args: unknown[]) => state.approve(...args), publishSubmission: vi.fn() }));
vi.mock('@/lib/editorial/submission-continuation', () => ({ continueSubmissionPreparation: (...args: unknown[]) => state.worker(...args), continueSubmissionWorkflow: (...args: unknown[]) => state.workflow(...args) }));
import { GET, POST } from '@/app/api/editorial/submissions/route';
import { getSubmissionStatus } from '@/lib/editorial/submissions';
import { quoteSubmission } from '@/lib/editorial/submission-approval';
import { submissionPublicationPreview } from '@/lib/editorial/submission-publication';
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
it('binds external personal image choice to authenticated owner, exact bytes and revision, without dispatching publication', async () => {
  const input = { action: 'select_image_candidate', id: body.id, revision: 2, assetId: 'c'.repeat(64), originalHash: 'd'.repeat(64) } as any;
  expect((await POST(request(input, 'https://untrusted.test'))).status).toBe(403);
  expect((await POST(request({ ...input, approved: true }))).status).toBe(409);
  state.access = null; expect((await POST(request(input))).status).toBe(401);
  state.access = { uid: 'colleague' }; candidate.select.mockResolvedValue({ revision: 3, publicationApproval: false });
  expect((await POST(request(input))).status).toBe(200);
  expect(candidate.select).toHaveBeenCalledExactlyOnceWith('colleague', body.id, 2, input.assetId, input.originalHash);
  expect(state.approve).not.toHaveBeenCalled(); expect(state.after).not.toHaveBeenCalled();
});
it('passes the authenticated team UID to the ownership-checked submission service', async () => {
  state.access = { uid: 'colleague', owner: false };
  expect((await POST(request())).status).toBe(202);
  expect(state.accept).toHaveBeenCalledWith('colleague', body.id, 1, body.quoteId);
});
it('binds personal decline to origin, session, revision and bytes without approval or dispatch', async () => {
  const input = { action: 'decline_image_candidate', id: body.id, revision: 2, assetId: 'c'.repeat(64), originalHash: 'd'.repeat(64) } as any;
  expect((await POST(request(input, 'https://untrusted.test'))).status).toBe(403);
  expect((await POST(request({ ...input, approved: true }))).status).toBe(409);
  expect((await POST(request({ ...input, originalHash: undefined }))).status).toBe(409);
  state.access = null; expect((await POST(request(input))).status).toBe(401);
  state.access = { uid: 'colleague' }; candidate.decline.mockResolvedValue({ revision: 2, imageDeclined: true, publicationApproval: false });
  expect((await POST(request(input))).status).toBe(200);
  expect(candidate.decline).toHaveBeenCalledExactlyOnceWith('colleague', body.id, 2, input.assetId, input.originalHash);
  expect(candidate.select).not.toHaveBeenCalled(); expect(state.consent).not.toHaveBeenCalled();
  expect(state.approve).not.toHaveBeenCalled(); expect(state.after).not.toHaveBeenCalled();
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
it('uses the same single consent externally and continues on the server without a chat message', async () => {
  state.consent.mockResolvedValue({ accepted: true }); state.workflow.mockResolvedValue({ status: 'published' });
  const req = request({ action: 'approve_publish', id: body.id, revision: 3, consentId: body.quoteId } as any);
  expect((await POST(req)).status).toBe(202);
  expect(state.consent).toHaveBeenCalledWith('owner', body.id, 3, body.quoteId, 'external-preview', 'now');
  await state.after.mock.calls[0][0](); expect(state.workflow).toHaveBeenCalledWith('owner', body.id);
  expect(state.accept).not.toHaveBeenCalled(); expect(state.approve).not.toHaveBeenCalled();
});
it('resumes a guarded pre-write failure without creating an approval and rejects forged inputs', async () => {
  const input = { action: 'resume_cms', id: body.id, expectedRevision: 10, expectedCmsHash: body.quoteId } as any;
  state.resume.mockResolvedValue({ status: 'processing' }); state.workflow.mockResolvedValue({ status: 'prepared' });
  expect((await POST(request(input, 'https://other.test'))).status).toBe(403);
  expect((await POST(request({ ...input, approved: true }))).status).toBe(409);
  state.access = null; expect((await POST(request(input))).status).toBe(401);
  state.access = { uid: 'owner' }; expect((await POST(request(input))).status).toBe(202);
  expect(state.resume).toHaveBeenCalledWith('owner', { submissionId: body.id, expectedRevision: 10, expectedCmsHash: body.quoteId });
  await state.after.mock.calls[0][0](); expect(state.workflow).toHaveBeenCalledWith('owner', body.id);
  expect(state.accept).not.toHaveBeenCalled(); expect(state.consent).not.toHaveBeenCalled(); expect(state.approve).not.toHaveBeenCalled();
});
it('lets the owner read the full saved article and anchored images before any approval', async () => {
  vi.mocked(getSubmissionStatus).mockResolvedValue({ status: 'awaiting_preparation', revision: 8, contentHash: 'hash',
    displayNames: { author: 'Liv Brandt', category: 'Kultur' },
    article: { title: 'Somebody Somewhere', intro: 'Intro', content: '<p>Før</p><figure><img src="https://example.com/body.jpg" alt="Foto"><figcaption>HBO</figcaption></figure><p>Efter</p>', featuredImage: 'https://example.com/cover.jpg' } } as any);
  vi.mocked(quoteSubmission).mockResolvedValue({ revision: 8, contentHash: 'hash', canAccept: true, humanReview: true } as any);
  const res = await GET(new Request(`${MCP_ORIGIN}/api/editorial/submissions?id=${body.id}`));
  expect(res.status).toBe(200); expect(res.headers.get('cache-control')).toBe('private, no-store');
  const data = await res.json();
  expect(data.reading).toMatchObject({ title: 'Somebody Somewhere', author: 'Liv Brandt', featuredImage: 'https://example.com/cover.jpg' });
  expect(data.reading.blocks.map((b: any) => b.kind)).toEqual(['text', 'image', 'text']);
  expect(data.preview).toBeNull(); expect(state.accept).not.toHaveBeenCalled(); expect(state.after).not.toHaveBeenCalled();
  expect(submissionPublicationPreview).not.toHaveBeenCalled();
});
it('keeps saved text readable during dependency failure but disables stale approval', async () => {
  vi.mocked(getSubmissionStatus).mockResolvedValue({ status: 'awaiting_preparation', revision: 2, contentHash: 'two',
    displayNames: {}, article: { title: 'Bevaret', content: '<p>Tekst</p>' } } as any);
  vi.mocked(quoteSubmission).mockRejectedValueOnce(Error('upstream'));
  const req = () => new Request(`${MCP_ORIGIN}/api/editorial/submissions?id=${body.id}`);
  const failed = await (await GET(req())).json();
  expect(failed.reading.title).toBe('Bevaret'); expect(failed.quote).toBeNull(); expect(failed.dependencyError).toBeTruthy();
  vi.mocked(quoteSubmission).mockResolvedValue({ revision: 3, contentHash: 'three', canAccept: true } as any);
  const changed = await (await GET(req())).json(); expect(changed.quote).toBeNull(); expect(changed.dependencyError).toContain('ændret');
  expect(state.accept).not.toHaveBeenCalled(); expect(state.after).not.toHaveBeenCalled();
});
