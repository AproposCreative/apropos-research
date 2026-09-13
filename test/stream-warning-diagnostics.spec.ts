import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { installStreamWarningDiagnostics, streamWarningDiagnostic } from '@/lib/stream-warning-diagnostics';

function warning() {
  return Object.assign(new Error('secret request body'), { name: 'MaxListenersExceededWarning', count: 11, type: 'close',
    stack: 'secret request body\n at hidden (/var/task/node_modules/pkg/stream.js:12:3)\n at hidden (node:internal/streams/pipeline:1:2)\n at https://secret.invalid/?token=private' });
}
it('retains only bounded code locations and allowed scalar metadata', () => {
  expect(streamWarningDiagnostic(warning())).toEqual({ event: 'stream_listener_warning', count: 11, listener: 'close',
    frames: ['node_modules/pkg/stream.js:12:3', 'node:internal/streams/pipeline:1:2'] });
  expect(streamWarningDiagnostic(new Error('other warning'))).toBeNull();
});
it('installs once and caps diagnostics without changing listener limits', () => {
  const emitter = new EventEmitter(), write = vi.fn(), limit = emitter.getMaxListeners();
  installStreamWarningDiagnostics(emitter, write);
  installStreamWarningDiagnostics(emitter, write);
  for (let i = 0; i < 10; i++) emitter.emit('warning', warning());
  expect(emitter.listenerCount('warning')).toBe(1);
  expect(write).toHaveBeenCalledTimes(3);
  expect(emitter.getMaxListeners()).toBe(limit);
});
it('does not interrupt the emitting operation if logging fails', () => {
  const emitter = new EventEmitter();
  installStreamWarningDiagnostics(emitter, () => { throw new Error('sink failed'); });
  expect(() => emitter.emit('warning', warning())).not.toThrow();
});
