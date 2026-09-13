import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), ingest: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: m.access }));
vi.mock('@/lib/trending/ingest-runner', () => ({ runIngestToFirestore: m.ingest }));
import { GET, POST } from '@/app/api/test-ingest/route';
const request = () => new Request('https://app.test/api/test-ingest', { method: 'POST' });
beforeEach(() => { vi.resetAllMocks(); m.access.mockResolvedValue({ uid: 'owner', owner: true }); });
it('does not run ingest during import or GET', async () => {
  expect(m.ingest).not.toHaveBeenCalled();
  const response = await GET(); expect(response.status).toBe(405);
  expect(response.headers.get('allow')).toBe('POST'); expect(m.ingest).not.toHaveBeenCalled();
});
it('requires the verified owner even without middleware', async () => {
  m.access.mockResolvedValue(null); expect((await POST(request())).status).toBe(401);
  m.access.mockResolvedValue({ owner: false }); expect((await POST(request())).status).toBe(403);
  expect(m.ingest).not.toHaveBeenCalled();
});
it('uses bounded server ingestion only after explicit POST', async () => {
  m.ingest.mockResolvedValue({ added: 2 });
  expect((await POST(request())).status).toBe(200);
  expect(m.ingest).toHaveBeenCalledExactlyOnceWith({ sinceHrs: 24, limit: 10 });
});
it('does not leak failure details', async () => {
  m.ingest.mockRejectedValue(new Error('secret-token'));
  const response = await POST(request()); expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('secret-token');
});
