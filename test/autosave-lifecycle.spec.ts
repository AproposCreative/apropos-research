import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bindAutosaveLifecycle } from '@/lib/autosave-lifecycle';
let page: EventTarget, doc: EventTarget & { visibilityState: string };
beforeEach(() => {
  page = new EventTarget(); doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('window', page); vi.stubGlobal('document', doc);
});
afterEach(() => vi.unstubAllGlobals());
it('flushes on pagehide and hidden visibility, not on visible focus', () => {
  const flush = vi.fn(); const cleanup = bindAutosaveLifecycle(flush);
  doc.dispatchEvent(new Event('visibilitychange')); expect(flush).not.toHaveBeenCalled();
  doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
  page.dispatchEvent(new Event('pagehide')); expect(flush).toHaveBeenCalledTimes(2); cleanup();
});
it('does not leave duplicate callbacks after strict-mode setup and cleanup', () => {
  const first = vi.fn(); bindAutosaveLifecycle(first)();
  const second = vi.fn(); const cleanup = bindAutosaveLifecycle(second);
  page.dispatchEvent(new Event('pagehide')); expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledTimes(1);
  cleanup(); page.dispatchEvent(new Event('pagehide')); expect(second).toHaveBeenCalledTimes(1);
});
