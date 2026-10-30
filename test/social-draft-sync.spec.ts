import { afterEach, expect, it, vi } from 'vitest';
import { DraftSync, type DraftTransport } from '@/app/design-editor/draftSync';
import type { SocialDraftRecord, SocialEditorDraft } from '@/lib/social/editor-draft';
const draft: SocialEditorDraft = { title: 'TONY', subtitle: 'En sommer former Bourdain.', subtitleStatus: 'manual', caption: 'Læs med.', theme: 'dark', size: 'story', titleSizePercent: 110, subtitleSizePercent: 90, eyebrowValues: ['Film'], storyMetaShuffleSeed: 2, facebook: false };
function fixture(initial: SocialDraftRecord = { revision: 0, draft: null, updatedAt: null }) {
  const rows = new Map<string, string>(); let remote = structuredClone(initial);
  const storage = { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); } };
  const write = vi.fn(async (revision: number, value: SocialEditorDraft) => {
    if (JSON.stringify(remote.draft) === JSON.stringify(value)) return { conflict: false, record: structuredClone(remote) };
    if (revision !== remote.revision) return { conflict: true, record: structuredClone(remote) };
    remote = { revision: revision + 1, draft: value, updatedAt: new Date().toISOString() };
    return { conflict: false, record: structuredClone(remote) };
  });
  const transport: DraftTransport = { read: vi.fn(async () => structuredClone(remote)), write };
  const make = (key = 'owner:article:source') => new DraftSync(storage, key, transport, () => {});
  return { rows, storage, transport, make, write, setRemote: (value: SocialDraftRecord) => { remote = value; } };
}
afterEach(() => vi.useRealTimers());
it('journals every edit immediately and restores text, format and design after closing', async () => {
  const f = fixture(), first = f.make(); await first.load(); first.edit(draft);
  expect(JSON.parse(f.rows.get('owner:article:source')!).pending).toEqual(draft);
  await first.flush(); first.close();
  const next = f.make(); await next.load(); expect(next.state.draft).toEqual(draft); expect(next.state.status).toBe('saved'); next.close();
});
it('retains offline work across reload and never overwrites a newer device automatically', async () => {
  const f = fixture({ revision: 1, draft, updatedAt: 'before' });
  f.rows.set('owner:article:source', JSON.stringify({ record: { revision: 1, draft, updatedAt: 'before' }, pending: { ...draft, title: 'Mine ændringer' } }));
  f.setRemote({ revision: 2, draft: { ...draft, title: 'Anden enhed' }, updatedAt: 'later' });
  const next = f.make(); await next.load(); expect(next.state.status).toBe('conflict'); expect(next.state.draft?.title).toBe('Mine ændringer');
  await next.flush(); expect(f.write).not.toHaveBeenCalled(); next.useServer();
  expect(next.state.draft?.title).toBe('Anden enhed'); next.close();
});
it('only replaces a conflicted server draft after explicit keep-local, using its new revision', async () => {
  const f = fixture({ revision: 1, draft, updatedAt: 'before' }), sync = f.make(); await sync.load();
  sync.edit({ ...draft, title: 'Mine ændringer' }); f.setRemote({ revision: 2, draft: { ...draft, title: 'Anden enhed' }, updatedAt: 'later' });
  await sync.flush(); expect(sync.state.status).toBe('conflict'); sync.keepLocal(); await sync.flush();
  expect(f.write.mock.calls.at(-1)?.[0]).toBe(2); expect(sync.state.status).toBe('saved'); sync.close();
});
it('safely replays a save whose acknowledgement was lost', async () => {
  const f = fixture(), sync = f.make(); await sync.load(); sync.edit(draft);
  f.transport.write = vi.fn(async (_revision, value) => { f.setRemote({ revision: 1, draft: value, updatedAt: 'now' }); throw Error('lost response'); });
  await sync.flush(); expect(sync.state.status).toBe('offline'); sync.close();
  f.transport.write = f.write;
  const next = f.make(); await next.load(); expect(next.state.status).toBe('saved'); expect(next.state.draft).toEqual(draft); next.close();
});
it('does not lose edits made during an in-flight save', async () => {
  const f = fixture(), sync = f.make(); await sync.load(); sync.edit(draft);
  let release!: (result: { conflict: boolean; record: SocialDraftRecord }) => void;
  f.transport.write = vi.fn(() => new Promise(resolve => { release = resolve; }));
  const pending = sync.flush(); sync.edit({ ...draft, caption: 'En nyere tekst.' });
  release({ conflict: false, record: { revision: 1, draft, updatedAt: 'now' } }); await pending;
  expect(JSON.parse(f.rows.get('owner:article:source')!).pending.caption).toBe('En nyere tekst.');
  sync.close();
});
it('keeps cached work readable offline and isolates account/article/source cache keys', async () => {
  const f = fixture(); f.rows.set('owner:article:source', JSON.stringify({ record: { revision: 1, draft, updatedAt: 'now' }, pending: null }));
  f.transport.read = vi.fn().mockRejectedValue(Error('offline'));
  const sync = f.make(); await sync.load(); expect(sync.state.ready).toBe(true); expect(sync.state.draft).toEqual(draft);
  const other = f.make('another-owner:article:source'); await other.load(); expect(other.state.ready).toBe(false); expect(other.state.draft).toBeNull();
  sync.close(); other.close();
});
it('does not restore corrupt local data over a valid remote draft', async () => {
  const f = fixture({ revision: 1, draft, updatedAt: 'now' }); f.rows.set('owner:article:source', '{broken');
  const sync = f.make(); await sync.load(); expect(sync.state.draft).toEqual(draft); sync.close();
});
