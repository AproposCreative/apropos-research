import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const f = vi.hoisted(() => ({ auth: vi.fn(), clean: vi.fn(), baseline: vi.fn() }));
vi.mock('@/lib/cron/cron-auth', () => ({ requireCronBearer: f.auth }));
vi.mock('@/lib/liv/published-cover-cleanup', () => ({ cleanPublishedCover: f.clean, publishedCoverBaseline: f.baseline }));
import { GET, POST } from '@/app/api/liv/operations/cover-cleanup/route';
const req = (body: string) => new NextRequest('https://app.test/api/liv/operations/cover-cleanup', { method: 'POST', body });
beforeEach(() => { vi.resetAllMocks(); });
it('requires service authentication before reading request data', async () => {
  f.auth.mockReturnValue(NextResponse.json({}, { status: 403 }));
  expect((await POST(req('invalid'))).status).toBe(403);
  expect((await GET(new NextRequest('https://app.test/api/liv/operations/cover-cleanup'))).status).toBe(403);
  expect(f.clean).not.toHaveBeenCalled(); expect(f.baseline).not.toHaveBeenCalled();
});
it('bounds upload size', async () => {
  expect((await POST(req('x'.repeat(3_000_001)))).status).toBe(409); expect(f.clean).not.toHaveBeenCalled();
});
it('does not expose provider credentials/errors', async () => {
  f.clean.mockRejectedValue(new Error('secret token from upstream'));
  expect(await (await POST(req('{}'))).json()).toEqual({ error: 'cover_cleanup_failed', publicationVerified: false });
});
