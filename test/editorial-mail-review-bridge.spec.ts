import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mountMailReviewBridge } from '@/lib/editorial-mail/review-bridge';
let handler: (e: MessageEvent) => Promise<void>;
const child = { postMessage: vi.fn() }, call = vi.fn(), onError = vi.fn(), remove = vi.fn();
const frame = { contentWindow: child, style: { height: '' } } as unknown as HTMLIFrameElement;
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('window', { addEventListener: (_: string, fn: typeof handler) => { handler = fn; }, removeEventListener: remove }); call.mockResolvedValue({ structuredContent: { status: 'draft' } }); });
afterEach(() => vi.unstubAllGlobals());
const event = (method: string, params?: unknown, source: unknown = child) => ({ source, data: { jsonrpc: '2.0', id: 1, method, params } }) as MessageEvent;
it('initialization only previews once and only sends data to the mounted frame', async () => {
  const dispose = mountMailReviewBridge({ frame, draftId: 'fixture', call, onError });
  await handler(event('ui/initialize')); expect(call).not.toHaveBeenCalled();
  await handler(event('ui/notifications/initialized')); await handler(event('ui/notifications/initialized'));
  expect(call).toHaveBeenCalledExactlyOnceWith('preview_editorial_reply', { draftId: 'fixture' });
  expect(child.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'ui/notifications/tool-result' }), '*');
  dispose(); expect(remove).toHaveBeenCalledOnce(); await handler(event('tools/call', { name: 'confirm_editorial_reply', arguments: {} })); expect(call).toHaveBeenCalledOnce();
});
it('ignores other windows, rejects unknown methods and clamps frame sizing', async () => {
  mountMailReviewBridge({ frame, draftId: 'fixture', call, onError });
  await handler(event('tools/call', { name: 'confirm_editorial_reply', arguments: {} }, {})); expect(call).not.toHaveBeenCalled();
  await handler(event('tools/call', { name: 'send', arguments: {} })); expect(call).not.toHaveBeenCalled();
  expect(child.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ error: expect.any(Object) }), '*');
  await handler(event('ui/notifications/size-changed', { height: 999999 })); expect(frame.style.height).toBe('20000px');
});
it('forwards one explicit UI request once; a lost acknowledgement is not retried', async () => {
  mountMailReviewBridge({ frame, draftId: 'fixture', call, onError }); call.mockRejectedValue(Error('connection lost'));
  await handler(event('tools/call', { name: 'confirm_editorial_reply', arguments: { token: 'fixture', displayedHash: 'fixture' } }));
  expect(call).toHaveBeenCalledOnce(); expect(child.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ error: expect.any(Object) }), '*');
});
