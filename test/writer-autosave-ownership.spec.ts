import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AutoSaveService } from '@/lib/auto-save-service';
const rows = new Map<string, string>();
beforeEach(() => {
  rows.clear(); vi.useFakeTimers();
  vi.stubGlobal('localStorage', { getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => rows.set(key, value), removeItem: (key: string) => rows.delete(key) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('separates saved work and refuses to adopt anonymous legacy data', () => {
  rows.set('ai-writer-autosave', JSON.stringify({ notes: 'unknown owner' }));
  const service = new AutoSaveService(); service.setOwner('frederik');
  expect(service.load().notes).toBe('');
  service.save({ notes: 'private Frederik' }); vi.advanceTimersByTime(2000);
  service.setOwner('milo'); expect(service.load().notes).toBe('');
  service.save({ notes: 'private Milo' }); vi.advanceTimersByTime(2000);
  service.setOwner('frederik'); expect(service.load().notes).toBe('private Frederik');
  expect(() => service.toDraftData('milo')).toThrow('autosave_owner_mismatch');
});
it('cancels pending writes when logging out or changing account', () => {
  const service = new AutoSaveService(); service.setOwner('frederik');
  service.save({ notes: 'pending' }); service.setOwner('milo'); vi.advanceTimersByTime(2000);
  expect(service.hasData()).toBe(false);
  service.setOwner(null); service.save({ notes: 'anonymous' }); vi.advanceTimersByTime(2000);
  expect(rows.size).toBe(0);
});
it('clears only the current owner and cancels the pending save', () => {
  const service = new AutoSaveService(); service.setOwner('milo');
  service.save({ notes: 'keep' }); vi.advanceTimersByTime(2000);
  service.setOwner('frederik'); service.save({ notes: 'discard' }); service.clear(); vi.advanceTimersByTime(2000);
  service.setOwner('milo'); expect(service.load().notes).toBe('keep');
});
