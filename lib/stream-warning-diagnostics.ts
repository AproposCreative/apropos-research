import type { EventEmitter } from 'node:events';

const installedKey = Symbol.for('apropos.stream-warning-diagnostics');
type Diagnostic = { event: 'stream_listener_warning'; count: number | null; listener: string | null; frames: string[] };

/** Keep code locations only, never warning messages, emitter objects or request data. */
export function streamWarningDiagnostic(warning: Error): Diagnostic | null {
  if (warning.name !== 'MaxListenersExceededWarning') return null;
  const detail = warning as Error & { count?: unknown; type?: unknown };
  const frames = (warning.stack || '').split('\n').slice(1).flatMap(line => {
    const match = line.match(/(?:node:internal\/[a-zA-Z0-9_./-]+|node_modules\/[a-zA-Z0-9@_./-]+|\.next\/server\/[a-zA-Z0-9_./-]+):\d+:\d+/);
    return match ? [match[0].slice(0, 240)] : [];
  }).slice(0, 8);
  return { event: 'stream_listener_warning',
    count: Number.isSafeInteger(detail.count) && Number(detail.count) >= 0 ? Number(detail.count) : null,
    listener: detail.type === 'error' || detail.type === 'close' ? detail.type : null, frames };
}

export function installStreamWarningDiagnostics(target: Pick<EventEmitter, 'on'> = process,
  write: (value: Diagnostic) => void = value => console.warn(JSON.stringify(value))) {
  const globals = globalThis as unknown as Record<symbol, WeakSet<object> | undefined>;
  const installed = globals[installedKey] ??= new WeakSet<object>();
  if (installed.has(target)) return;
  installed.add(target);
  let remaining = 3;
  target.on('warning', (warning: Error) => {
    if (!remaining) return;
    const diagnostic = streamWarningDiagnostic(warning);
    if (!diagnostic) return;
    remaining--;
    try { write(diagnostic); } catch { /* Diagnostics must never interrupt work. */ }
  });
}
