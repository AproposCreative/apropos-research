import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), writes: vi.fn(), docs: new Map<string, any>() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: m.access }));
function ref(path: string): any { return { path, collection: (id: string) => ref(`${path}/${id}`), doc: (id: string) => ref(`${path}/${id}`) }; }
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: ref,
  runTransaction: (fn: any) => fn({
    get: async (r: any) => ({ exists: m.docs.has(r.path), data: () => m.docs.get(r.path) }),
    create: (r: any, data: any) => { m.writes(r.path, data); m.docs.set(r.path, data); },
    update: (r: any, data: any) => { m.writes(r.path, data); m.docs.set(r.path, { ...m.docs.get(r.path), ...data }); },
  }),
}) }));
import { POST } from '@/app/api/editorial/tips/select/route';
import { requiresEditorialOwner } from '@/lib/editorial-capabilities';
const id = 'a'.repeat(64);
const request = (tipId = id) => new Request('https://app.test/api/editorial/tips/select', { method: 'POST', body: JSON.stringify({ id: tipId }) });
beforeEach(() => {
  vi.clearAllMocks(); m.docs.clear(); m.access.mockResolvedValue({ uid: 'frederik', owner: true });
  m.docs.set(`editorialTips/${id}`, { url: 'https://soundvenue.com/story', angle: 'En kulturel vinkel', status: 'proposed' });
});
it('creates an unresearched desk idea and records the selection', async () => {
  const response = await POST(request()); expect(response.status).toBe(200);
  const data = await response.json(); const story = m.docs.get(`editorialDesks/frederik/stories/${data.storyId}`);
  expect(story.status).toBe('discovered'); expect(story.research).toBeUndefined();
  expect(story.signal.sources[0].content).toBe(''); expect(story.signal.evidence).toEqual([]);
  expect(m.docs.get(`editorialTips/${id}`).status).toBe('selected');
});
it('does not rewrite a story or selection receipt on retry', async () => {
  const first = await (await POST(request())).json(); m.writes.mockClear();
  const second = await (await POST(request())).json(); expect(second.storyId).toBe(first.storyId);
  expect(second.created).toBe(false); expect(m.writes).not.toHaveBeenCalled();
});
it('reuses an existing story when another tip links to the same source', async () => {
  const first = await (await POST(request())).json(); const other = 'b'.repeat(64);
  m.docs.set(`editorialTips/${other}`, { url: 'https://soundvenue.com/story', angle: 'En anden vinkel', status: 'proposed' });
  const second = await (await POST(request(other))).json(); expect(second.storyId).toBe(first.storyId); expect(second.created).toBe(false);
});
it('rejects colleagues, missing identity and malformed selectors', async () => {
  expect(requiresEditorialOwner('/api/editorial/tips/select', 'POST')).toBe(true);
  m.access.mockResolvedValue({ owner: false }); expect((await POST(request())).status).toBe(403);
  m.access.mockResolvedValue(null); expect((await POST(request())).status).toBe(401);
  m.access.mockResolvedValue({ uid: 'frederik', owner: true }); expect((await POST(request('../private'))).status).toBe(400);
  expect(m.writes).not.toHaveBeenCalled();
});
it('returns missing instead of inventing a tip', async () => {
  m.docs.clear(); expect((await POST(request())).status).toBe(404); expect(m.writes).not.toHaveBeenCalled();
});
