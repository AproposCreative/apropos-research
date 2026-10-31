import { expect, it, vi } from 'vitest';
import { sessionCipher, storyStore } from '../services/story-browser/store.mjs';
import { clickPublish } from '../services/story-browser/business-suite.mjs';

function fixture() {
  let now = Date.parse('2026-10-31T16:45:00Z'), tail = Promise.resolve();
  const rows = new Map<string, any>();
  const snapshot = (path: string) => ({ data: () => structuredClone(rows.get(path)) });
  const ref = (path: string) => ({ path, get: async () => snapshot(path), set: async (row: any) => { rows.set(path, structuredClone(row)); } });
  const db = { collection: (name: string) => ({ doc: (id: string) => ref(name+'/'+id) }),
    runTransaction(work: (tx: any) => Promise<any>) {
      const next = tail.then(async () => {
        const writes: Array<() => void> = [];
        const result = await work({ get: async (r: any) => snapshot(r.path),
          set: (r: any, value: any) => writes.push(() => rows.set(r.path, structuredClone(value))),
          update: (r: any, value: any) => writes.push(() => rows.set(r.path, { ...rows.get(r.path), ...structuredClone(value) })),
        }); writes.forEach(write => write()); return result;
      }); tail = next.catch(() => {}); return next;
    } };
  const store = storyStore(db, sessionCipher('unit-test-secret-never-a-real-key'), () => now);
  function add(id = 'one') {
    rows.set('socialStoryBrowserTasks/'+id, { id, ownerUid: 'owner', status: 'queued', dispatchCount: 0,
      createdAt: new Date(now).toISOString(), imageSha256: 'hash', articleUrl: 'https://www.aproposmagazine.com/articles/tony' });
    rows.set('socialPublishOperations/'+id, { id, ownerUid: 'owner', delivery: 'business-suite', channels: { instagram: true, facebook: false },
      imageSha256: 'hash', approved: { isStory: true, articleUrl: 'https://www.aproposmagazine.com/articles/tony' },
      storyLink: { status: 'pending' }, instagram: { status: 'pending' }, complete: false });
  }
  add();
  return { store, rows, add, advance: (ms: number) => { now += ms; } };
}
it('encrypts hosted session state and rejects corruption or another key', async () => {
  const cipher = sessionCipher('unit-test-secret-never-a-real-key'), state = { cookies: [{ value: 'private-session' }] };
  const encrypted = cipher.encrypt(state);
  expect(JSON.stringify(encrypted)).not.toContain('private-session');
  expect(cipher.decrypt(encrypted)).toEqual(state);
  expect(() => cipher.decrypt({ ...encrypted, tag: Buffer.alloc(16).toString('base64') })).toThrow();
  expect(() => sessionCipher('different-unit-test-secret-long-enough').decrypt(encrypted)).toThrow();
  const f = fixture(); await f.store.saveSession(state);
  expect(await f.store.session()).toEqual(state); expect((await f.store.status()).connected).toBe(true);
});
it('allows one concurrent preparation and exactly one durable publish intent', async () => {
  const f = fixture();
  const claims = await Promise.all(Array.from({ length: 8 }, () => f.store.claim('one')));
  expect(claims.filter(x => x.claimed)).toHaveLength(1);
  const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => f.store.beforePublish('one')));
  expect(attempts.filter(x => x.status === 'fulfilled')).toHaveLength(1);
  expect(f.rows.get('socialStoryBrowserTasks/one').dispatchCount).toBe(1);
  expect(f.rows.get('socialPublishOperations/one').instagram.status).toBe('sending');
});
it('never steals an ambiguous account lock after the lease expires', async () => {
  const f = fixture(); await f.store.claim('one'); await f.store.beforePublish('one');
  await f.store.finish('one', {}); f.advance(11*60_000); f.add('two');
  expect(await f.store.claim('two')).toMatchObject({ claimed: false, busy: true });
  expect(await f.store.claim('one')).toMatchObject({ claimed: false });
  expect(f.rows.get('socialPublishOperations/one').instagram.status).toBe('uncertain');
});
it('fails expired personal approvals without publishing or holding the account', async () => {
  const f = fixture(); f.advance(31*60_000);
  expect(await f.store.claim('one')).toMatchObject({ claimed: false, expired: true });
  expect(f.rows.get('socialStoryBrowserTasks/one').dispatchCount).toBe(0);
  expect(f.rows.get('socialPublishOperations/one')).toMatchObject({ complete: true, instagram: { status: 'failed' } });
  f.add('two'); expect((await f.store.claim('two')).claimed).toBe(true);
});
it('preserves a published Story even if link readback is unconfirmed and ignores stale completion', async () => {
  const f = fixture(); await f.store.claim('one'); await f.store.beforePublish('one');
  const published = await f.store.finish('one', { mediaId: '123', storyUrl: 'https://www.instagram.com/stories/aproposmagazineofficial/123/', linkVerified: false });
  expect(published).toMatchObject({ complete: true, phase: 'story_link_unverified', instagram: { status: 'published', id: '123' }, storyLink: { status: 'unverified' } });
  expect(await f.store.finish('one', {})).toEqual(published);
  f.add('two'); expect((await f.store.claim('two')).claimed).toBe(true);
});
it('rejects tampered task bindings and never fabricates a publish from a preflight error', async () => {
  const f = fixture(); f.rows.get('socialStoryBrowserTasks/one').articleUrl += '-changed';
  await expect(f.store.claim('one')).rejects.toThrow('invalid_story_task');
  const other = fixture(); await other.store.claim('one');
  const row = await other.store.finish('one', { mediaId: 'not-dispatched', linkVerified: false });
  expect(row.instagram.status).toBe('failed'); expect(other.rows.get('socialStoryBrowserTasks/one').dispatchCount).toBe(0);
});
it('never clicks Del before the durable intent, or again after an ambiguous timeout', async () => {
  const events: string[] = [];
  const page = { getByRole: (_role: string, spec: { name: string }) => ({ click: async () => { events.push(spec.name); }, waitFor: async () => { throw Error('timeout'); } }) };
  await expect(clickPublish(page, async () => { throw Error('database unavailable'); })).rejects.toThrow();
  expect(events).toEqual([]);
  await expect(clickPublish(page, async () => { events.push('persist'); })).rejects.toThrow('timeout');
  expect(events).toEqual(['persist', 'Del']);
});
