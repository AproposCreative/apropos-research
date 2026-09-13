import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ access: vi.fn(), db: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mock.access }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: mock.db }));
vi.mock('@/lib/articles/writer-cms-save', () => ({ saveWriterCmsDraft: mock.save,
  WriterCmsPending: class extends Error { constructor(readonly articleId?: string) { super('Afventer'); } } }));
import { POST } from '@/app/api/writer/cms-save/route';
const body = { draftId: 'draft-a', article: { title: 'Kultur', content: '<p>Tekst</p>' } };
const request = (value: unknown) => new Request('http://localhost/api/writer/cms-save', { method: 'POST', body: JSON.stringify(value) });
beforeEach(() => { vi.resetAllMocks(); mock.access.mockResolvedValue({ uid: 'alice' }); mock.db.mockReturnValue({}); mock.save.mockResolvedValue({ articleId: '0123456789abcdef01234567', publicationVerified: false }); });
it('denies anonymous callers before reading or writing state', async () => {
  mock.access.mockResolvedValue(null);
  expect((await POST(request(body))).status).toBe(401);
  expect(mock.db).not.toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled();
});
it.each([{...body, uid:'bob'}, {...body, draftId:'../foreign'}, {...body, article:{title:'',content:'x'}}, {...body, article:{title:'x',content:'x',webflowId:'invalid'}}])('rejects invalid or user-selected ownership fields', async value => {
  expect((await POST(request(value))).status).toBe(400); expect(mock.save).not.toHaveBeenCalled();
});
it('uses server identity and private responses', async () => {
  const response = await POST(request(body));
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mock.save).toHaveBeenCalledWith({}, 'alice', 'draft-a', body.article);
});
it('hides internal failure details and never claims publication', async () => {
  mock.save.mockRejectedValue(new Error('SECRET upstream payload'));
  const response = await POST(request(body)); const result = await response.json();
  expect(response.status).toBe(503); expect(result.publicationVerified).toBe(false);
  expect(JSON.stringify(result)).not.toContain('SECRET');
});
