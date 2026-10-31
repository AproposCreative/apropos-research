'use client';
import { useEffect, useRef } from 'react';

export type RemoteInput = { type: 'text'; text: string } | { type: 'key'; key: string } |
  { type: 'click'; x: number; y: number } | { type: 'scroll'; x: number; y: number; deltaY: number };
const keys = new Set(['Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
const point = (x: number, y: number, element: HTMLElement) => {
  const r = element.getBoundingClientRect();
  return { x: Math.max(0, Math.min(1650, (x-r.left)/r.width*1650)), y: Math.max(0, Math.min(1045, (y-r.top)/r.height*1045)) };
};

/** Only transient human input. No password state, storage, analytics or replay. */
export default function RemoteMetaScreen({ screenshot, disabled, onEvents }: {
  screenshot: string; disabled: boolean; onEvents: (events: RemoteInput[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null), queue = useRef<RemoteInput[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const screen = useRef<HTMLButtonElement>(null);
  const send = useRef(onEvents); send.current = onEvents;
  const flush = () => {
    clearTimeout(timer.current); timer.current = undefined;
    const events = queue.current; queue.current = [];
    if (events.length) send.current(events);
  };
  const push = (event: RemoteInput) => {
    if (disabled) return;
    const previous = queue.current.at(-1);
    if (event.type === 'text' && previous?.type === 'text' && previous.text.length + event.text.length <= 2000) previous.text += event.text;
    else {
      if (queue.current.length >= 20 || event.type === 'text') flush();
      queue.current.push(event);
    }
    clearTimeout(timer.current); timer.current = setTimeout(flush, 65);
  };
  useEffect(() => () => { clearTimeout(timer.current); queue.current = []; }, []);
  useEffect(() => { if (disabled) { clearTimeout(timer.current); queue.current = []; } }, [disabled]);
  const pushEvent = useRef(push); pushEvent.current = push;
  useEffect(() => {
    const element = screen.current; if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.deltaY) pushEvent.current({ type: 'scroll', ...point(event.clientX, event.clientY, element), deltaY: Math.max(-1045, Math.min(1045, event.deltaY)) });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  return <div style={{ position: 'relative', marginTop: 12, borderRadius: 12, overflow: 'hidden', border: '1px solid #333' }}>
    <button ref={screen} type="button" disabled={disabled} aria-label="Meta-login på serveren. Klik i et felt og skriv direkte. Escape forlader tastaturbetjeningen."
      style={{ display: 'block', width: '100%', padding: 0, border: 0, background: '#fff', cursor: 'text' }}
      onClick={event => {
        input.current?.focus({ preventScroll: true });
        if (event.detail) push({ type: 'click', ...point(event.clientX, event.clientY, event.currentTarget) });
      }}>
      <img src={'data:image/jpeg;base64,'+screenshot} alt="Metas login-side i serverbrowseren" draggable={false} style={{ display: 'block', width: '100%' }} />
    </button>
    <input ref={input} type="password" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
      aria-label="Skriv direkte i det valgte Meta-felt" disabled={disabled} maxLength={2000}
      style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, opacity: 0 }}
      onBlur={flush}
      onChange={event => {
        const text = event.currentTarget.value; event.currentTarget.value = '';
        if (text) push({ type: 'text', text });
      }}
      onPaste={event => {
        event.preventDefault(); const text = event.clipboardData.getData('text/plain');
        if (text && text.length <= 2000) push({ type: 'text', text });
      }}
      onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
          event.preventDefault(); push({ type: 'key', key: 'Control+A' });
        } else if (keys.has(event.key)) {
          event.preventDefault(); push({ type: 'key', key: event.key === 'Tab' && event.shiftKey ? 'Shift+Tab' : event.key });
          if (event.key === 'Escape') event.currentTarget.blur();
        }
      }} />
  </div>;
}
