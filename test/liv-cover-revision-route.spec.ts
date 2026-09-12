import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), revise: vi.fn() }));
vi.mock('@/lib/cron/cron-auth', () => ({ requireCronBearer: mocks.auth }));
vi.mock('@/lib/liv/cover-revision', () => ({ reviseLivCover: mocks.revise }));
import { POST } from '@/app/api/liv/operations/cover-revision/route';
const request = (body: string) => new NextRequest('https://app.example/api/liv/operations/cover-revision', { method: 'POST', body });
beforeEach(() => { vi.resetAllMocks(); mocks.revise.mockResolvedValue({ status: 'cover_staged', publicationVerified: false }); });
it('authenticates before body parsing, storage or media work', async () => {
  mocks.auth.mockReturnValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
  expect((await POST(request('not-json'))).status).toBe(403);
  expect(mocks.revise).not.toHaveBeenCalled();
});
it.each(['{', '', 'x'.repeat(8001)])('rejects malformed/oversized JSON before the operation', async body => {
  expect((await POST(request(body))).status).toBe(400); expect(mocks.revise).not.toHaveBeenCalled();
});
it('returns staged-only results without publication', async () => {
  const response = await POST(request('{"requestId":"fixture"}'));
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ status: 'cover_staged', publicationVerified: false });
});
it.each([['liv_cover_invalid', 400], ['liv_cover_invalid_source', 400], ['liv_cover_busy', 409],
  ['liv_cover_patch_requires_reconciliation', 409], ['liv_cover_store_unavailable', 503]])('reports bounded error %s', async (message, status) => {
  mocks.revise.mockRejectedValue(new Error(message));
  const response = await POST(request('null'));
  expect(response.status).toBe(status); expect(await response.json()).toEqual({ error: message, publicationVerified: false });
});
it('never exposes raw upstream errors or credentials', async () => {
  mocks.revise.mockRejectedValue(new Error('upstream token=secret https://private.example'));
  expect(await (await POST(request('{}'))).json()).toEqual({ error: 'liv_cover_failed', publicationVerified: false });
});
