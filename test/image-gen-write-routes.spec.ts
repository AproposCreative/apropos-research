import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ access: vi.fn(), claim: vi.fn(), run: vi.fn(), after: vi.fn(), quotes: vi.fn(),
  style: vi.fn(), updateStyle: vi.fn(), budget: vi.fn(), preview: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: f.access }));
vi.mock('next/server', () => ({ after: f.after }));
vi.mock('@/lib/image-gen/jobs', () => ({ claimImageGenJob: f.claim }));
vi.mock('@/lib/image-gen/runtime', () => ({ runImageGenJob: f.run }));
vi.mock('@/lib/image-gen/quotes', () => ({ imageGenQuotes: f.quotes }));
vi.mock('@/lib/image-gen/style-config', () => ({ readImageGenStyleConfig: f.style, updateImageGenStyle: f.updateStyle }));
vi.mock('@/lib/image-gen/draft', () => ({ previewImageGenDraft: f.preview, saveImageGenDraft: f.save }));
vi.mock('@/lib/image-gen/budget', () => ({ IMAGE_GEN_LEDGER: 'imageGenCostLedger', readImageGenBudget: f.budget }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
import { POST as run } from '@/app/api/image-gen/run/route';
import { POST as style } from '@/app/api/image-gen/styles/route';
import { POST as settings } from '@/app/api/image-gen/settings/route';
import { POST as draft } from '@/app/api/image-gen/draft/route';
const body = { operation: 'generate', articleId: 'a'.repeat(24), articleVersion: 'b'.repeat(64), requestId: 'idempotent-request-001',
  quoteId: 'quote', parameters: { description: 'Scene' }, uid: 'forged-owner' };
const request = (data = body) => new Request('https://example.test/api/image-gen/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
beforeEach(() => { vi.resetAllMocks(); f.quotes.mockResolvedValue({ generate: { id: 'quote' }, ideas: { id: 'quote' } }); });
it.each([run, style, settings, draft])('rejects anonymous mutations before state changes', async handler => {
  f.access.mockResolvedValue(null); expect([401,403]).toContain((await handler(request())).status);
  expect(f.claim).not.toHaveBeenCalled(); expect(f.updateStyle).not.toHaveBeenCalled(); expect(f.preview).not.toHaveBeenCalled();
});
it.each(['milo', 'casper'])('keeps %s out of image-gen mutations during the private pilot', async uid => {
  f.access.mockResolvedValue({ uid, owner: false });
  expect((await run(request())).status).toBe(401); expect([401, 403]).toContain((await style(request())).status); expect([401, 403]).toContain((await settings(request())).status); expect((await draft(request())).status).toBe(401);
  expect(f.claim).not.toHaveBeenCalled(); expect(f.updateStyle).not.toHaveBeenCalled(); expect(f.preview).not.toHaveBeenCalled();
});
it('rejects an outdated quote without creating work or calling a provider', async () => {
  f.access.mockResolvedValue({ uid: 'frederik', owner: true });
  expect((await run(request({ ...body, quoteId: 'old' }))).status).toBe(409);
  expect(f.claim).not.toHaveBeenCalled(); expect(f.after).not.toHaveBeenCalled();
});
it('does not schedule a duplicate job and uses deterministic research identity', async () => {
  f.access.mockResolvedValue({ uid: 'frederik', owner: true }); f.claim.mockResolvedValue({ created: false, job: { id: 'existing', status: 'succeeded' } });
  expect((await run(request({ ...body, operation: 'ideas' }))).status).toBe(200);
  expect(f.claim.mock.calls[0][1].requestId).toBe(`ideas-${body.articleVersion}`);
  expect(f.after).not.toHaveBeenCalled(); expect(f.run).not.toHaveBeenCalled();
});
