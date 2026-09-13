import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { WriterWorkspaceSync } from '@/lib/writer-workspace-sync';
import type { WorkspacePayload } from '@/lib/writer-workspace';

// Two real sync controllers against the real API handlers, with only identity
// verification and Firestore transport substituted. No real user data or AI.
const store = vi.hoisted(() => ({ rows: new Map<string, any>(), serial: Promise.resolve() }));
vi.mock('@/lib/editorial-access', () => ({ verifyEditorialToken: async (token: string) =>
  ['alice', 'bob'].includes(token) ? { uid: token, owner: token === 'alice' } : null }));
vi.mock('@/lib/firebase-admin', () => {
  const snapshot = (path: string) => ({ exists: store.rows.has(path), data: () => structuredClone(store.rows.get(path)) });
  const ref = (path: string): any => ({ path, get: async () => snapshot(path), collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }) });
  return { getAdminDb: () => ({ collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: (run: any) => {
      const result = store.serial.then(() => run({
        get: async (r: any) => snapshot(r.path),
        set: (r: any, value: any) => store.rows.set(r.path, structuredClone(value)),
        create: (r: any, value: any) => { if (store.rows.has(r.path)) throw new Error('exists'); store.rows.set(r.path, structuredClone(value)); },
      }));
      store.serial = result.then(() => undefined, () => undefined); return result;
    },
  }) };
});
import { GET, PUT } from '@/app/api/writer/workspace/route';
const payload = (notes: string): WorkspacePayload => ({ messages: [], chatTitle: 'Private draft', articleData: {}, notes, showWizard: false, currentDraftId: 'draft' });
const sessions: WriterWorkspaceSync[] = [];
function device(uid: string) {
  const request = (body?: string) => new NextRequest('https://fixture.test/api/writer/workspace?userId=bob', {
    method: body ? 'PUT' : 'GET', headers: { Authorization: `Bearer ${uid}` }, ...(body ? { body } : {}),
  });
  const controls = { offline: false, loseNextReceipt: false, writes: [] as string[] };
  const sync = new WriterWorkspaceSync({
    read: async () => { if (controls.offline) throw new Error('offline'); return GET(request()); },
    write: async body => {
      controls.writes.push(body);
      if (controls.offline) throw new Error('offline');
      const response = await PUT(request(body));
      if (controls.loseNextReceipt) { controls.loseNextReceipt = false; throw new Error('response lost after commit'); }
      return response;
    },
  }, () => {});
  sessions.push(sync); sync.setData(payload('')); return { sync, controls };
}
beforeEach(() => { store.rows.clear(); store.serial = Promise.resolve(); vi.useFakeTimers(); });
afterEach(() => { sessions.splice(0).forEach(sync => sync.dispose()); vi.useRealTimers(); });

it('offers work saved on device A for explicit resume on device B without an empty overwrite', async () => {
  const a = device('alice'); await a.sync.start(); a.sync.setData(payload('Saved on A'));
  await vi.advanceTimersByTimeAsync(2000);
  const b = device('alice'); await b.sync.start(); await vi.advanceTimersByTimeAsync(5000);
  expect(b.sync.state.resume?.data.notes).toBe('Saved on A'); expect(b.controls.writes).toHaveLength(0);
  b.sync.setData(b.sync.state.resume!.data); b.sync.acceptResume();
  b.sync.setData(payload('Continued on B')); await vi.advanceTimersByTimeAsync(2000);
  expect(store.rows.get('writerWorkspaces/alice')).toMatchObject({ revision: 2, data: { notes: 'Continued on B' } });
});

it('preserves both texts when two devices edit the same revision', async () => {
  const a = device('alice'), b = device('alice'); await Promise.all([a.sync.start(), b.sync.start()]);
  a.sync.setData(payload('Device A')); b.sync.setData(payload('Device B'));
  await vi.advanceTimersByTimeAsync(2000);
  expect([a.sync.state.phase, b.sync.state.phase].sort()).toEqual(['conflict', 'saved']);
  const conflicts = [...store.rows].filter(([key]) => key.includes('/conflicts/'));
  expect(conflicts).toHaveLength(1);
  expect(new Set([store.rows.get('writerWorkspaces/alice').data.notes, conflicts[0][1].data.notes])).toEqual(new Set(['Device A','Device B']));
});

it('reconciles a lost successful response without duplicate revisions, then saves newer offline text', async () => {
  const a = device('alice'); await a.sync.start(); a.controls.loseNextReceipt = true;
  a.sync.setData(payload('First')); await vi.advanceTimersByTimeAsync(2000);
  expect(a.sync.state.phase).toBe('offline'); expect(store.rows.get('writerWorkspaces/alice').revision).toBe(1);
  a.sync.setData(payload('Newer')); await a.sync.retry();
  expect(a.controls.writes[1]).toBe(a.controls.writes[0]);
  expect(store.rows.get('writerWorkspaces/alice').revision).toBe(1);
  await vi.advanceTimersByTimeAsync(2000);
  expect(store.rows.get('writerWorkspaces/alice')).toMatchObject({ revision: 2, data: { notes: 'Newer' } });
});

it('does not expose Bob to Alice even when the owner request supplies Bob in the query', async () => {
  const b = device('bob'); await b.sync.start(); b.sync.setData(payload('Bob private')); await vi.advanceTimersByTimeAsync(2000);
  const a = device('alice'); await a.sync.start();
  expect(a.sync.state.resume).toBeNull(); a.sync.setData(payload('Alice private')); await vi.advanceTimersByTimeAsync(2000);
  expect(store.rows.get('writerWorkspaces/bob').data.notes).toBe('Bob private');
  expect(store.rows.get('writerWorkspaces/alice').data.notes).toBe('Alice private');
});
