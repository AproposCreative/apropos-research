import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const state = vi.hoisted(() => ({ db: null as any, access: { uid: 'owner', owner: true } as null | { uid: string; owner: boolean } }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: async () => state.access }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => ({ authors: [], categories: [], topics: [], requiredFields: [], checkedAt: '' }) }));
import { GET, POST } from '@/app/api/editorial/ideas/route';
import { saveEditorialIdeas, getEditorialIdea } from '@/lib/editorial/ideas';
let memory: ReturnType<typeof memoryFirestore>;
beforeEach(() => { memory = memoryFirestore(); state.db = memory.db; state.access = { uid: 'owner', owner: true }; });
const idea = { topicKey: 'museum-besoegsguide', title: 'Kulturguide: En udstilling', suggestedKind: 'culture-guide', angle: 'En konkret vej ind i udstillingen.', whyNow: 'Åben denne måned', caveats: 'Ingen egen tilstedeværelse.',
  sources: [{ title: 'Museum', url: 'https://example.com/museum', retrievedAt: '2026-10-31T10:00:00Z', publishedAt: null, notes: 'Praktisk kilde.' }] };
const saved = () => saveEditorialIdeas('owner', { requestId: 'route-idea-20261031', ideas: [idea] });
const get = (id?: string) => GET(new Request(`https://example.com/api/editorial/ideas${id ? `?id=${id}` : ''}`));
const post = (body: unknown) => POST(new Request('https://example.com/api/editorial/ideas', { method: 'POST', body: JSON.stringify(body) }));

it('reads the same private idea store and exposes detail without starting work', async () => {
  const a = await saved(), before = structuredClone([...memory.rows]);
  const list = await get(); expect(list.status).toBe(200); expect(list.headers.get('Cache-Control')).toContain('private, no-store');
  expect((await list.json()).items[0]).toMatchObject({ id: a.ids[0], status: 'suggested' });
  const detail = await (await get(a.ids[0])).json();
  expect(detail).toMatchObject({ sources: idea.sources, caveats: idea.caveats, topicKey: idea.topicKey, status: 'suggested' });
  expect(detail.uid).toBeUndefined(); expect([...memory.rows]).toEqual(before);
});
it('requires a verified owner and retains UID isolation even between owner workspaces', async () => {
  const a = await saved();
  state.access = null; expect((await get()).status).toBe(401); expect((await post({})).status).toBe(401);
  state.access = { uid: 'editor', owner: false }; expect((await get()).status).toBe(403); expect((await post({})).status).toBe(403);
  state.access = { uid: 'other-owner', owner: true };
  expect((await get(a.ids[0])).status).toBe(404); expect((await post({ ideaId: a.ids[0], expectedRevision: 1 })).status).toBe(404);
});
it('selects once, returns the existing chat and a fixed ID-only handoff without creating articles', async () => {
  const a = await saved(), input = { ideaId: a.ids[0], expectedRevision: 1 };
  const one = await (await post(input)).json(), two = await (await post(input)).json();
  expect(one).toMatchObject({ idea: { status: 'selected', revision: 2, submission: null }, publicationApproval: false, paidAiCalls: 0 });
  expect(two).toEqual(one); expect(one.handoff.chatUrl).toBe('https://chatgpt.com/c/6acb2584-2f20-83eb-a335-031a584b8d3b');
  expect(one.handoff.prompt).toContain(a.ids[0]); expect(one.handoff.prompt).not.toContain(idea.title);
  expect([...memory.rows.keys()].every(path => path.startsWith('writerWorkspaces/owner/editorialIdea'))).toBe(true);
});
it('rejects stale revisions and caller-supplied owner or consent', async () => {
  const a = await saved();
  expect((await post({ ideaId: a.ids[0], expectedRevision: 4 })).status).toBe(409);
  for (const extra of [{ uid: 'other' }, { publicationApproval: true }]) {
    expect((await post({ ideaId: a.ids[0], expectedRevision: 1, ...extra })).status).toBe(400);
  }
  expect((await get('invalid')).status).toBe(400);
  expect((await getEditorialIdea('owner', { ideaId: a.ids[0] })).status).toBe('suggested');
});

it('retains off-remit source details but refuses to start them', async () => {
  const a = await saveEditorialIdeas('owner', { requestId: 'retained-route-20261031', ideas: [{ ...idea, suggestedKind: undefined, title: 'Soundvenue søger videopraktikant' }] });
  const before = structuredClone([...memory.rows]);
  const detail = await (await get(a.ids[0])).json();
  expect(detail).toMatchObject({ editorialRemit: { eligible: false }, sources: idea.sources });
  expect((await post({ ideaId: a.ids[0], expectedRevision: 1 })).status).toBe(409);
  expect([...memory.rows]).toEqual(before);
});
