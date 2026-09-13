import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WriterWorkspaceSync } from '@/lib/writer-workspace-sync';
import type { WorkspacePayload } from '@/lib/writer-workspace';
const data = (notes = ''): WorkspacePayload => ({ messages: [], chatTitle: 'Titel', articleData: {}, notes, showWizard: false, currentDraftId: 'own' });
const snapshot = { revision: 4, updatedAt: '2026-09-13', data: data('cloud') };
const deferred = () => { let resolve!: (value: Response) => void; const promise = new Promise<Response>(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function fixture() {
  const read = vi.fn().mockImplementation(async () => Response.json({ workspace: null }));
  const write = vi.fn().mockImplementation(async () => Response.json({ revision: 1 }));
  const restore = vi.fn().mockImplementation(async () => Response.json({ workspace: { ...snapshot, revision: 5 } }));
  const changed = vi.fn(); const sync = new WriterWorkspaceSync({ read, write, restore }, changed);
  sync.setData(data());
  return { sync, read, write, restore, changed };
}
it('debounces latest work for two seconds and makes no empty initial write', async () => {
  const { sync, write } = fixture(); await sync.start(); await vi.advanceTimersByTimeAsync(2000);
  expect(write).not.toHaveBeenCalled();
  sync.setData(data('a')); await vi.advanceTimersByTimeAsync(1500);
  sync.setData(data('b')); await vi.advanceTimersByTimeAsync(1999); expect(write).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(JSON.parse(write.mock.calls[0][0])).toEqual({ revision: 0, data: data('b') });
  expect(sync.state.phase).toBe('saved'); sync.dispose();
});
it('does not overwrite a remote workspace while the user is choosing whether to resume', async () => {
  const { sync, read, write } = fixture(); read.mockResolvedValueOnce(Response.json({ workspace: snapshot }));
  sync.setData(data('typed during load')); await sync.start(); await vi.advanceTimersByTimeAsync(5000);
  expect(write).not.toHaveBeenCalled(); expect(sync.state.resume).toEqual(snapshot);
  sync.setData(snapshot.data); sync.acceptResume(); await vi.advanceTimersByTimeAsync(2000);
  expect(write).not.toHaveBeenCalled(); sync.dispose();
});
it('retries exactly the uncertain write before sending subsequent edits', async () => {
  const { sync, write } = fixture(); write.mockRejectedValueOnce(new Error('offline'));
  await sync.start(); sync.setData(data('first')); await vi.advanceTimersByTimeAsync(2000);
  expect(sync.state.phase).toBe('offline'); sync.setData(data('second'));
  await vi.advanceTimersByTimeAsync(60000); expect(write).toHaveBeenCalledTimes(1);
  await sync.retry(); expect(write.mock.calls[1][0]).toBe(write.mock.calls[0][0]);
  await vi.advanceTimersByTimeAsync(2000);
  expect(JSON.parse(write.mock.calls[2][0])).toEqual({ revision: 1, data: data('second') }); sync.dispose();
});
it('keeps the latest edits made while a write is in flight', async () => {
  const { sync, write } = fixture(); const pending = deferred(); write.mockReturnValueOnce(pending.promise);
  await sync.start(); sync.setData(data('first')); await vi.advanceTimersByTimeAsync(2000);
  sync.setData(data('newer')); await vi.advanceTimersByTimeAsync(2000); expect(write).toHaveBeenCalledTimes(1);
  pending.resolve(Response.json({ revision: 1 })); await vi.advanceTimersByTimeAsync(2000);
  expect(JSON.parse(write.mock.calls[1][0]).data.notes).toBe('newer'); sync.dispose();
});
it('ignores a late response after account disposal and does not send more writes', async () => {
  const { sync, write, changed } = fixture(); const pending = deferred(); write.mockReturnValueOnce(pending.promise);
  await sync.start(); sync.setData(data('Frederik')); await vi.advanceTimersByTimeAsync(2000);
  sync.dispose(); changed.mockClear(); pending.resolve(Response.json({ revision: 20 }));
  await vi.advanceTimersByTimeAsync(10000);
  expect(changed).not.toHaveBeenCalled(); expect(write).toHaveBeenCalledTimes(1);
});
it('keeps conflicts paused rather than silently overwriting another device', async () => {
  const { sync, write } = fixture(); write.mockResolvedValueOnce(Response.json({ conflict: true }, { status: 409 }));
  await sync.start(); sync.setData(data('mine')); await vi.advanceTimersByTimeAsync(2000);
  expect(sync.state.phase).toBe('conflict'); await sync.retry(); sync.setData(data('more'));
  await vi.advanceTimersByTimeAsync(10000); expect(write).toHaveBeenCalledTimes(1); sync.dispose();
});
it('retries an unavailable initial read without erasing text typed offline', async () => {
  const { sync, read, write } = fixture(); read.mockRejectedValueOnce(new Error('offline'));
  await sync.start(); sync.setData(data('offline typing')); await sync.retry();
  await vi.advanceTimersByTimeAsync(2000);
  expect(JSON.parse(write.mock.calls[0][0]).data.notes).toBe('offline typing'); sync.dispose();
});
it('never marks an invalid response saved', async () => {
  const { sync, write } = fixture(); write.mockResolvedValueOnce(Response.json({ revision: 'wrong' }));
  await sync.start(); sync.setData(data('work')); await vi.advanceTimersByTimeAsync(2000);
  expect(sync.state.phase).toBe('offline'); sync.dispose();
});
it('does not turn an unavailable initial load into a writable workspace when a local copy is opened', async () => {
  const { sync, read, write } = fixture(); read.mockRejectedValueOnce(new Error('offline'));
  await sync.start(); sync.setData(data('restored local')); sync.acceptResume();
  expect(sync.state.phase).toBe('offline');
  await sync.retry(); await vi.advanceTimersByTimeAsync(2000);
  expect(JSON.parse(write.mock.calls[0][0]).data.notes).toBe('restored local'); sync.dispose();
});
it('allows correcting a rejected payload without repeatedly sending the invalid version', async () => {
  const { sync, write } = fixture(); write.mockResolvedValueOnce(Response.json({}, { status: 413 }));
  await sync.start(); sync.setData(data('large')); await vi.advanceTimersByTimeAsync(2000);
  expect(sync.state.phase).toBe('invalid');
  sync.setData(data('smaller')); await vi.advanceTimersByTimeAsync(2000);
  expect(JSON.parse(write.mock.calls[1][0]).data.notes).toBe('smaller'); sync.dispose();
});
it('ignores late initial reads from a disposed account', async () => {
  const { sync, read, changed, write } = fixture(); const pending = deferred(); read.mockReturnValueOnce(pending.promise);
  const started = sync.start(); sync.dispose(); changed.mockClear();
  pending.resolve(Response.json({ workspace: snapshot })); await started; await vi.advanceTimersByTimeAsync(10000);
  expect(changed).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
});
it('restores a selected version and cancels a scheduled autosave of the previous content', async () => {
  const { sync, read, restore, write } = fixture(); await sync.start(); sync.setData(data('local'));
  read.mockResolvedValueOnce(Response.json({ workspace: snapshot }));
  const result = await sync.restore({ kind: 'history', id: '3' });
  expect(result.data.notes).toBe('cloud');
  expect(JSON.parse(restore.mock.calls[0][0])).toMatchObject({ revision: 4, local: data('local'), selection: { kind: 'history', id: '3' } });
  await vi.advanceTimersByTimeAsync(2000); expect(write).not.toHaveBeenCalled(); sync.dispose();
});
it('retries an uncertain restore with the exact same operation and refuses another selection', async () => {
  const { sync, restore } = fixture(); await sync.start(); sync.setData(data('local'));
  restore.mockRejectedValueOnce(new Error('lost response'));
  await expect(sync.restore({ kind: 'history', id: '3' })).rejects.toThrow();
  await expect(sync.restore({ kind: 'history', id: '4' })).rejects.toThrow('samme version');
  expect(restore).toHaveBeenCalledTimes(1);
  await sync.restore({ kind: 'history', id: '3' });
  expect(restore.mock.calls[1][0]).toBe(restore.mock.calls[0][0]); sync.dispose();
});
it('keeps newer local edits after an uncertain restore instead of replacing them on retry', async () => {
  const { sync, restore, write } = fixture(); await sync.start(); sync.setData(data('local before'));
  restore.mockRejectedValueOnce(new Error('lost response'));
  await expect(sync.restore({ kind: 'history', id: '3' })).rejects.toThrow();
  sync.setData(data('local newer'));
  await expect(sync.restore({ kind: 'history', id: '3' })).rejects.toThrow('nyere lokale');
  expect(sync.state.phase).toBe('resume'); expect(sync.state.resume?.data.notes).toBe('cloud');
  await vi.advanceTimersByTimeAsync(5000); expect(write).not.toHaveBeenCalled(); sync.dispose();
});
it('ignores a restore response when the account has been disposed', async () => {
  const { sync, restore, changed } = fixture(); await sync.start();
  const pending = deferred(); restore.mockReturnValueOnce(pending.promise);
  const operation = sync.restore({ kind: 'history', id: '3' });
  const rejected = expect(operation).rejects.toThrow('Kontoen');
  await vi.advanceTimersByTimeAsync(0); sync.dispose(); changed.mockClear();
  pending.resolve(Response.json({ workspace: snapshot })); await rejected;
  expect(changed).not.toHaveBeenCalled();
});
