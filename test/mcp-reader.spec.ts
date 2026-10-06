import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const fake = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => fake.db }));
import { registerReaderSource, listReaderSources, getReaderProgress, saveReaderProgress, readerCoverage } from '@/lib/mcp/reader';
import { editorialWorkflow } from '@/lib/editorial/workflows';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
const memory = memoryFirestore(), uid = 'frederik';
const registration = { sourceUrl: 'https://bibliotek.kk.dk/reader?orderid=00000000-0000-4000-8000-000000000001', title: 'Testbog, ikke et rigtigt lån', author: 'Testforfatter' };
const layout = { key: 'test 1200x800 font16 zoom100 editionfixture', totalPositions: 6 };
const observedAt = '2026-10-06T18:00:00.000Z';
const checkpoint = { position: 2, chapter: '1', anchor: 'Kort testanker.' };
beforeEach(() => { memory.clear(); fake.db = memory.db; vi.unstubAllGlobals(); });
async function start() { return (await registerReaderSource(uid, registration)).sourceId; }
const batch = (sourceId: string, patch: Record<string, unknown> = {}) => ({ sourceId, requestId: 'reading-batch-001', expectedRevision: 0,
  access: 'available', observedAt, layout, checkpoint, readRanges: [{ start: 1, end: 2, chapter: '1' }], beginningObserved: true,
  notes: 'Egne noter om svigt og venskab.', ...patch });
it('registers privately without touching Writer, fetch, AI, CMS, or interpreting registration as reading', async () => {
  const fetcher = vi.fn(() => { throw Error('unexpected_network'); }); vi.stubGlobal('fetch', fetcher);
  memory.rows.set(`writerWorkspaces/${uid}`, { revision: 42, data: { article: 'Bevar' } });
  const saved = await withoutPaidAi(() => registerReaderSource(uid, registration));
  expect(saved).toMatchObject({ revision: 0, coverage: [], independentlyVerified: false, publicationApproval: false, browserStarted: false, paidAiCalls: 0 });
  expect(await registerReaderSource(uid, registration)).toMatchObject({ replay: true, sourceId: saved.sourceId });
  expect((await listReaderSources(uid, {})).items).toHaveLength(1);
  expect((await listReaderSources('casper', {})).items).toEqual([]);
  await expect(getReaderProgress('casper', { sourceId: saved.sourceId })).rejects.toThrow('mcp_reader_not_found');
  await expect(saveReaderProgress('casper', batch(saved.sourceId))).rejects.toThrow('mcp_reader_not_found');
  expect(memory.rows.get(`writerWorkspaces/${uid}`).revision).toBe(42); expect(fetcher).not.toHaveBeenCalled();
  expect(JSON.stringify((await listReaderSources(uid, {})))).not.toContain('orderid=');
});
it.each(['http://bibliotek.kk.dk/reader?orderid=00000000-0000-4000-8000-000000000001',
  'https://bibliotek.kk.dk.evil.example/reader?orderid=00000000-0000-4000-8000-000000000001',
  `${registration.sourceUrl}&token=secret`, `${registration.sourceUrl}&orderid=00000000-0000-4000-8000-000000000002`,
  'https://user:pass@bibliotek.kk.dk/reader?orderid=00000000-0000-4000-8000-000000000001',
  'https://127.0.0.1/reader', `${registration.sourceUrl}#secret`])('rejects invalid/credential-bearing reader URL %s', async sourceUrl => {
  await expect(registerReaderSource(uid, { ...registration, sourceUrl })).rejects.toThrow(); expect(memory.rows.size).toBe(0);
});
it('does not silently replace an existing book identity or accept injected identity/publication fields', async () => {
  await start();
  await expect(registerReaderSource(uid, { ...registration, title: 'Anden bog' })).rejects.toThrow('mcp_reader_identity_conflict');
  await expect(registerReaderSource(uid, { ...registration, uid: 'casper' })).rejects.toThrow();
  const id = await start();
  for (const patch of [{ publicationApproval: true }, { complete: true }, { text: 'Hele bogen' }, { notes: 'x'.repeat(2001) }, { checkpoint: { ...checkpoint, anchor: 'x'.repeat(121) } }]) {
    await expect(saveReaderProgress(uid, batch(id, patch))).rejects.toThrow();
  }
  expect((await getReaderProgress(uid, { sourceId: id })).revision).toBe(0);
});
it('persists exact checkpoints, notes and gaps across independent requests without fake full-read proof', async () => {
  const id = await start();
  await withoutPaidAi(() => saveReaderProgress(uid, batch(id)));
  const readback = await getReaderProgress(uid, { sourceId: id });
  expect(readback.checkpoint).toMatchObject({ ...checkpoint, observedAt });
  expect(readback.coverage[0]).toMatchObject({ status: 'partial', readPositions: 2, percent: 33, nextPosition: 3, gaps: [{ start: 3, end: 6 }] });
  expect(readback.batches[0].notes).toContain('venskab');
  const final = await saveReaderProgress(uid, batch(id, { requestId: 'reading-batch-002', expectedRevision: 1,
    checkpoint: { ...checkpoint, position: 6 }, readRanges: [{ start: 3, end: 6, chapter: '2' }], beginningObserved: false, endObserved: true }));
  expect(final.coverage[0]).toMatchObject({ status: 'reported_complete', percent: 100, nextPosition: null });
  expect(final).toMatchObject({ independentlyVerified: false, publicationApproval: false });
});
it('preserves prior boundary evidence across middle batches without accepting cumulative flags as new observations', async () => {
  const id = await start(); await saveReaderProgress(uid, batch(id));
  const middle = batch(id, { requestId: 'reading-batch-middle', expectedRevision: 1,
    checkpoint: { ...checkpoint, position: 4 }, readRanges: [{ start: 3, end: 4, chapter: '2' }], beginningObserved: false });
  for (const flags of [{ beginningObserved: true }, { endObserved: true }]) {
    await expect(saveReaderProgress(uid, { ...middle, ...flags })).rejects.toThrow('mcp_reader_boundary_unobserved');
    expect((await getReaderProgress(uid, { sourceId: id })).revision).toBe(1);
  }
  const saved = await saveReaderProgress(uid, middle);
  expect(saved.coverage[0]).toMatchObject({ beginningObserved: true, endObserved: false, readPositions: 4,
    status: 'partial', nextPosition: 5 });
  const readback = await getReaderProgress(uid, { sourceId: id });
  expect(readback.batches[1]).toMatchObject({ beginningObserved: false, endObserved: false,
    readRanges: [{ start: 3, end: 4, chapter: '2' }] });
});
it('replays the same receipt after timeout and after a later revision without overwriting', async () => {
  const id = await start(), input = batch(id); await saveReaderProgress(uid, input);
  await saveReaderProgress(uid, batch(id, { requestId: 'reading-batch-002', expectedRevision: 1, notes: 'Senere noter' }));
  expect(await saveReaderProgress(uid, input)).toMatchObject({ replay: true, revision: 1, currentRevision: 2 });
  await expect(saveReaderProgress(uid, { ...input, notes: 'Andet payload' })).rejects.toThrow('mcp_reader_request_conflict');
  expect((await getReaderProgress(uid, { sourceId: id })).revision).toBe(2);
  expect([...memory.rows.keys()].filter(k => k.includes('/batches/'))).toHaveLength(2);
});
it('rejects concurrent/stale revisions without overwriting saved observations', async () => {
  const id = await start();
  const results = await Promise.allSettled([saveReaderProgress(uid, batch(id)), saveReaderProgress(uid, batch(id, { requestId: 'reading-batch-002' }))]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((await getReaderProgress(uid, { sourceId: id })).revision).toBe(1);
  await expect(saveReaderProgress(uid, batch(id, { requestId: 'reading-batch-003', expectedRevision: 1, observedAt: '2026-10-05T18:00:00Z' }))).rejects.toThrow('mcp_reader_stale_observation');
});
it('never adds reflow positions from different layouts or counts duplicate reads twice', async () => {
  const id = await start(); await saveReaderProgress(uid, batch(id));
  await saveReaderProgress(uid, batch(id, { requestId: 'reading-batch-002', expectedRevision: 1 }));
  await saveReaderProgress(uid, batch(id, { requestId: 'reading-batch-003', expectedRevision: 2,
    layout: { ...layout, totalPositions: 8 }, readRanges: [{ start: 3, end: 4, chapter: '1' }], beginningObserved: false }));
  const readback = await getReaderProgress(uid, { sourceId: id });
  expect(readback.coverage.map(c => c.readPositions)).toEqual([2, 2]);
  expect(readback.coverage.map(c => c.nextPosition)).toEqual([3, 1]);
});
it('visiting the last page and marking only one boundary never establishes full reading', async () => {
  const id = await start();
  const result = await saveReaderProgress(uid, batch(id, { readRanges: [], beginningObserved: false, checkpoint: { ...checkpoint, position: 6 } }));
  expect(result.coverage[0]).toMatchObject({ readPositions: 0, status: 'partial', nextPosition: 1 });
  expect(readerCoverage({ ...layout, ranges: [{ start: 1, end: 6 }], beginningObserved: true, endObserved: false }).status).toBe('partial');
});
it.each(['login_required', 'captcha_required', 'loan_expired', 'browser_unavailable', 'protected_content', 'reader_error'])('records %s without deleting the checkpoint or counting blocked reading', async access => {
  const id = await start(); await saveReaderProgress(uid, batch(id));
  const input = { sourceId: id, expectedRevision: 1, requestId: 'blocked-batch-001', access, observedAt, notes: 'Kræver sikker brugerhandling' };
  await saveReaderProgress(uid, input);
  const result = await getReaderProgress(uid, { sourceId: id });
  expect(result.access).toBe(access); expect(result.checkpoint).toMatchObject(checkpoint); expect(result.coverage[0].readPositions).toBe(2);
  await expect(saveReaderProgress(uid, { ...input, expectedRevision: 2, requestId: 'blocked-batch-002', readRanges: [{ start: 3, end: 4, chapter: '1' }] })).rejects.toThrow('mcp_reader_blocked_cannot_read');
});
it('validates range bounds, observed boundaries, future timestamps and small batches', async () => {
  const id = await start();
  for (const patch of [
    { layout: undefined }, { checkpoint: undefined }, { checkpoint: { ...checkpoint, position: 7 } },
    { readRanges: [{ start: 4, end: 3, chapter: '1' }] }, { readRanges: [{ start: 1, end: 7, chapter: '1' }] },
    { readRanges: [], endObserved: true }, { readRanges: [{ start: 2, end: 3, chapter: '1' }], beginningObserved: true },
    { layout: { ...layout, totalPositions: 30 }, readRanges: [{ start: 1, end: 21, chapter: '1' }] },
    { observedAt: '2099-01-01T00:00:00Z' },
  ]) await expect(saveReaderProgress(uid, batch(id, patch))).rejects.toThrow();
  expect((await getReaderProgress(uid, { sourceId: id })).revision).toBe(0);
});
it('paginates notes numerically, searches only each bounded page and returns a cursor even for no matches', async () => {
  const id = await start();
  for (let n = 0; n < 12; n++) await saveReaderProgress(uid, batch(id, { requestId: `reading-batch-${String(n).padStart(3, '0')}`, expectedRevision: n,
    notes: n === 11 ? 'Et spørgsmål om VENSKAB.' : 'Anden note' }));
  const first = await getReaderProgress(uid, { sourceId: id, query: 'venskab', limit: 10 });
  expect(first.batches).toEqual([]); expect(first.scannedBatches).toBe(10); expect(first.nextCursor).toBe(10);
  const second = await getReaderProgress(uid, { sourceId: id, query: 'venskab', afterRevision: first.nextCursor });
  expect(second.batches.map(b => b.revision)).toEqual([12]); expect(second.nextCursor).toBeNull();
  expect(second.searchScope).toBe('saved_notes_and_anchors_only_not_full_book');
});
it('paginates private sources and never leaks another colleague’s title', async () => {
  for (let n = 1; n <= 3; n++) await registerReaderSource(uid, { ...registration, sourceUrl: registration.sourceUrl.slice(0, -1) + n });
  await registerReaderSource('casper', { ...registration, title: 'Privat kollegabog' });
  const first = await listReaderSources(uid, { limit: 2 }); expect(first.items).toHaveLength(2); expect(first.nextCursor).toBeTruthy();
  const second = await listReaderSources(uid, { limit: 2, cursor: first.nextCursor }); expect(second.items).toHaveLength(1); expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items, ...second.items].map(s => s.sourceId)).size).toBe(3);
  expect(JSON.stringify([first, second])).not.toContain('Privat kollegabog');
});
it('discovers the exact existing private book by KK URL without another registration', async () => {
  const id = await start(); await saveReaderProgress(uid, batch(id));
  expect((await listReaderSources(uid, { sourceUrl: registration.sourceUrl })).items[0]).toMatchObject({ sourceId: id, revision: 1 });
  expect((await listReaderSources('other', { sourceUrl: registration.sourceUrl })).items).toEqual([]);
  expect((await getReaderProgress(uid, { sourceId: id })).revision).toBe(1);
});
it('ships a versioned focused cloud workflow with honest capability and publication boundaries', () => {
  const result = editorialWorkflow({ workflow: 'read' });
  expect(result.versionHash).toMatch(/^[a-f0-9]{64}$/); expect(result.instructions).toContain('save_reader_progress');
  expect(result.instructions).toContain('MCP åbner/styrer ikke browseren'); expect(result.instructions).toContain('550–700');
  expect(result).toMatchObject({ paidAiCalls: 0, publicationApproval: false });
});
